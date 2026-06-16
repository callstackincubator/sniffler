import { dirname, join } from "node:path";
import type { SnifflerConfig, SnifflerOutputFormat } from "../config/config-schema.js";
import { loadConfig } from "../config/load-config.js";
import { createGlobMatcher, normalizePath } from "../filesystem/path-utils.js";
import { createNodeFileSystem } from "../filesystem/node-filesystem.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { buildGraph, type GraphNode } from "../graph/build-graph.js";
import { traverseImpact } from "../graph/traverse-impact.js";
import { renderJsonOutput } from "../output/json-output.js";
import type { ImpactOutput } from "../output/output-types.js";
import { renderTextOutput } from "../output/text-output.js";
import { scanFileText } from "../scanner/scan-file.js";
import { loadTestMap } from "../test-map/load-test-map.js";
import { matchTests } from "../test-map/match-tests.js";
import { discoverWorkspaces } from "../workspaces/discover-workspaces.js";
import { packageJsonWorkspacesStrategy } from "../workspaces/package-json-workspaces.js";
import { pnpmWorkspaceStrategy } from "../workspaces/pnpm-workspace-yaml.js";
import type { TsconfigPathsConfig } from "../resolvers/resolve-import.js";

export type ImpactCommandInput = {
  base?: string;
  head?: string;
  changedFiles?: ReadonlyArray<string>;
  configPath?: string;
  format?: SnifflerOutputFormat;
};

export type ImpactCommandResult = {
  exitCode: number;
  output: string;
  impact?: ImpactOutput;
};

export type GitDiffProvider = (input: {
  base: string;
  head: string;
  cwd: string;
}) => Promise<ReadonlyArray<string>>;

export type ImpactCommandDeps = {
  fs?: FileSystem;
  cwd?: string;
  gitDiff?: GitDiffProvider;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const getFs = (deps: ImpactCommandDeps): FileSystem => {
  return deps.fs ?? createNodeFileSystem();
};

const getCwd = (deps: ImpactCommandDeps): string => {
  return normalizePath(deps.cwd ?? process.cwd());
};

const matchesPattern = (path: string, pattern: string): boolean => {
  const normalizedPattern = normalizePath(pattern);
  const variants = new Set<string>([normalizedPattern, normalizedPattern.replaceAll("**/", "")]);

  for (const variant of variants) {
    if (variant.length === 0) {
      continue;
    }

    if (createGlobMatcher(variant)(path)) {
      return true;
    }
  }

  return false;
};

const discoverSourceFiles = async (
  fs: FileSystem,
  cwd: string,
  config: SnifflerConfig
): Promise<Array<string>> => {
  const roots = config.source?.roots ?? [];
  const extensions = config.source?.extensions ?? [];
  const ignorePatterns = config.source?.ignore ?? [];

  if (roots.length === 0 || extensions.length === 0) {
    return [];
  }

  const includePatterns = sortUniqueStrings(
    roots.flatMap((root) => {
      const normalizedRoot = normalizePath(root);
      const rootPrefix = normalizedRoot === "." ? "" : `${normalizedRoot}/`;

      return extensions.map((extension) => `${rootPrefix}**${extension}`);
    })
  );

  const candidates = await fs.glob(includePatterns, { cwd, dot: true });
  const ignoredCandidates = new Set(
    ignorePatterns.length === 0
      ? []
      : (await fs.glob(ignorePatterns, { cwd, dot: true })).map((path) => normalizePath(path))
  );

  const discovered = candidates
    .map((path) => normalizePath(path))
    .filter((path) => !ignoredCandidates.has(path))
    .filter((path) => !ignorePatterns.some((pattern) => matchesPattern(path, pattern)))
    .sort((left, right) => left.localeCompare(right));

  return discovered;
};

const loadTsconfigPaths = async (
  fs: FileSystem,
  cwd: string,
  config: SnifflerConfig
): Promise<TsconfigPathsConfig | undefined> => {
  const tsconfigPath = config.resolver?.tsconfig;

  if (tsconfigPath === undefined) {
    return undefined;
  }

  const resolvedTsconfigPath = normalizePath(join(cwd, tsconfigPath));

  if (!(await fs.exists(resolvedTsconfigPath))) {
    return undefined;
  }

  let rawTsconfig: unknown;

  try {
    rawTsconfig = await fs.readJson<unknown>(resolvedTsconfigPath);
  } catch {
    return undefined;
  }

  if (typeof rawTsconfig !== "object" || rawTsconfig === null || Array.isArray(rawTsconfig)) {
    return undefined;
  }

  const compilerOptions = "compilerOptions" in rawTsconfig ? (rawTsconfig as Record<string, unknown>).compilerOptions : undefined;

  if (typeof compilerOptions !== "object" || compilerOptions === null || Array.isArray(compilerOptions)) {
    return undefined;
  }

  const pathsValue = "paths" in compilerOptions ? (compilerOptions as Record<string, unknown>).paths : undefined;
  const baseUrlValue = "baseUrl" in compilerOptions ? (compilerOptions as Record<string, unknown>).baseUrl : undefined;

  if (typeof pathsValue !== "object" || pathsValue === null || Array.isArray(pathsValue)) {
    return undefined;
  }

  const paths: Record<string, ReadonlyArray<string>> = {};

  for (const [key, value] of Object.entries(pathsValue as Record<string, unknown>)) {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
      continue;
    }

    paths[key] = value;
  }

  if (Object.keys(paths).length === 0) {
    return undefined;
  }

  const baseUrl =
    typeof baseUrlValue === "string"
      ? normalizePath(join(dirname(resolvedTsconfigPath), baseUrlValue))
      : normalizePath(dirname(resolvedTsconfigPath));

  return {
    baseUrl,
    paths
  };
};

const resolveChangedFilesFromGit = async (
  input: ImpactCommandInput,
  deps: ImpactCommandDeps,
  cwd: string
): Promise<Array<string>> => {
  if (input.changedFiles !== undefined && input.changedFiles.length > 0) {
    return sortUniqueStrings(input.changedFiles.map((path) => normalizePath(path)));
  }

  if (input.base === undefined) {
    return [];
  }

  const gitDiff =
    deps.gitDiff ??
    (async ({ base, head, cwd: nextCwd }) => {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const args = ["diff", "--name-only", base, head];
      const result = await execFileAsync("git", args, { cwd: nextCwd });
      return String(result.stdout)
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter((path) => path.length > 0);
    });

  const head = input.head ?? "HEAD";
  const changedFiles = await gitDiff({
    base: input.base,
    head,
    cwd
  });

  return sortUniqueStrings(changedFiles.map((path) => normalizePath(path)));
};

export const runImpactCommand = async (
  input: ImpactCommandInput,
  deps: ImpactCommandDeps
): Promise<ImpactCommandResult> => {
  const fs = getFs(deps);
  const cwd = getCwd(deps);
  const config = (await loadConfig({ fs, configPath: input.configPath })).config;
  const changedFiles = await resolveChangedFilesFromGit(input, deps, cwd);
  const workspaceStrategies = [
    ...(config.workspaces?.strategies?.includes("package-json") ? [packageJsonWorkspacesStrategy] : []),
    ...(config.workspaces?.strategies?.includes("pnpm-workspace") ? [pnpmWorkspaceStrategy] : [])
  ];
  const workspacePackages = await discoverWorkspaces(cwd, fs, workspaceStrategies);
  const tsconfigPaths = await loadTsconfigPaths(fs, cwd, config);
  const sourceFiles = await discoverSourceFiles(fs, cwd, config);
  const scanWarnings: string[] = [];
  const graphNodes: GraphNode[] = [];

  for (const path of sourceFiles) {
    const text = await fs.readFile(path);
    const scan = scanFileText({ filePath: path, text });

    for (const warning of scan.warnings) {
      scanWarnings.push(warning.message);
    }

    graphNodes.push({
      path,
      scan
    });
  }

  const graph = await buildGraph(graphNodes, {
    resolveContext: {
      fs,
      workspacePackages,
      sourceExtensions: config.source?.extensions,
      tsconfigPaths,
      conditions: config.resolver?.conditions
    }
  });

  const impact = await traverseImpact(graph, changedFiles);
  const testMap = await loadTestMap(fs, normalizePath(join(cwd, config.tests?.manifest ?? ".sniffler/test-map.json")));
  const recommendedTests = matchTests({ testMap, impact });
  const output: ImpactOutput = {
    changedFiles: sortUniqueStrings(changedFiles),
    affectedModules: sortUniqueStrings(impact.affectedModules),
    recommendedTests,
    warnings: sortUniqueStrings(scanWarnings)
  };

  const format = input.format ?? config.output?.format ?? "text";
  const rendered = format === "json" ? renderJsonOutput(output) : renderTextOutput(output);

  return {
    exitCode: 0,
    output: rendered,
    impact: output
  };
};
