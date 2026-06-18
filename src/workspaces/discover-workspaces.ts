import type { FileSystem } from "../filesystem/filesystem.js";
import { dirname, isAbsolute, join, relative } from "node:path";
import { normalizePath } from "../filesystem/path-utils.js";

export type WorkspacePackage = {
  name: string;
  root: string;
  packageJsonPath: string;
  tsconfigPath?: string;
  exports?: unknown;
};

export type WorkspaceStrategy = {
  name: string;
  discover: (root: string, fs: FileSystem) => Promise<ReadonlyArray<WorkspacePackage>>;
};

type PackageJsonFile = {
  name?: unknown;
  exports?: unknown;
};

export const toWorkspacePackageJsonPattern = (pattern: string): string => {
  const normalizedPattern = normalizePath(pattern.trim());

  if (normalizedPattern === "." || normalizedPattern === "./") {
    return "package.json";
  }

  if (normalizedPattern.endsWith("/package.json") || normalizedPattern === "package.json") {
    return normalizedPattern;
  }

  return normalizePath(join(normalizedPattern, "package.json"));
};

export const readWorkspacePackage = async (
  packageJsonPath: string,
  fs: FileSystem,
  workspaceRoot?: string
): Promise<WorkspacePackage | undefined> => {
  const packageJson = await fs.readJson<PackageJsonFile>(packageJsonPath);

  if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
    return undefined;
  }

  const normalizedPackageJsonPath = normalizePath(packageJsonPath);
  const root =
    workspaceRoot !== undefined && isAbsolute(workspaceRoot) && isAbsolute(normalizedPackageJsonPath)
      ? normalizePath(relative(workspaceRoot, dirname(normalizedPackageJsonPath)))
      : normalizePath(dirname(normalizedPackageJsonPath));
  const tsconfigPath = normalizePath(join(root, "tsconfig.json"));
  const tsconfigProbePath =
    workspaceRoot !== undefined && isAbsolute(workspaceRoot) && isAbsolute(normalizedPackageJsonPath)
      ? normalizePath(join(workspaceRoot, tsconfigPath))
      : tsconfigPath;
  const hasTsconfig = await fs.exists(tsconfigProbePath);

  return {
    name: packageJson.name,
    root,
    packageJsonPath:
      workspaceRoot !== undefined && isAbsolute(workspaceRoot) && isAbsolute(normalizedPackageJsonPath)
        ? normalizePath(relative(workspaceRoot, normalizedPackageJsonPath))
        : normalizedPackageJsonPath,
    ...(hasTsconfig ? { tsconfigPath } : {}),
    ...("exports" in packageJson ? { exports: packageJson.exports } : {})
  };
};

export const discoverWorkspacePackagesFromPatterns = async (
  root: string,
  fs: FileSystem,
  patterns: ReadonlyArray<string>
): Promise<Array<WorkspacePackage>> => {
  const includePatterns = patterns
    .filter((pattern) => !pattern.trim().startsWith("!"))
    .map(toWorkspacePackageJsonPattern);
  const excludePatterns = patterns
    .filter((pattern) => pattern.trim().startsWith("!"))
    .map((pattern) => toWorkspacePackageJsonPattern(pattern.trim().slice(1)));

  if (includePatterns.length === 0) {
    return [];
  }

  const packageJsonPaths = await fs.glob(includePatterns, { cwd: root, dot: true });
  const excludedPaths = new Set(await fs.glob(excludePatterns, { cwd: root, dot: true }));
  const packages: WorkspacePackage[] = [];

  for (const packageJsonPath of packageJsonPaths.filter((path) => !excludedPaths.has(path))) {
    const workspacePackage = await readWorkspacePackage(normalizePath(join(root, packageJsonPath)), fs, root);

    if (workspacePackage !== undefined) {
      packages.push(workspacePackage);
    }
  }

  return packages.sort((left, right) => left.root.localeCompare(right.root));
};

export const discoverWorkspaces = async (
  root: string,
  fs: FileSystem,
  strategies: ReadonlyArray<WorkspaceStrategy> = []
): Promise<Array<WorkspacePackage>> => {
  void fs;

  const packages: WorkspacePackage[] = [];
  for (const strategy of strategies) {
    const discovered = await strategy.discover(root, fs);
    for (const workspacePackage of discovered) {
      if (packages.some((existing) => existing.root === workspacePackage.root)) {
        continue;
      }
      packages.push(workspacePackage);
    }
  }

  return packages;
};
