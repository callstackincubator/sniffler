import type { FileSystem } from "../filesystem/filesystem.js";
import {
  discoverWorkspacePackagesFromPatterns,
  readWorkspacePackage,
  type WorkspacePackage,
  type WorkspaceStrategy
} from "./discover-workspaces.js";

const unquoteYamlScalar = (value: string): string => {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const stripComment = (line: string): string => {
  const commentIndex = line.indexOf("#");
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
};

export const parsePnpmWorkspacePackages = (text: string): ReadonlyArray<string> => {
  const lines = text.split(/\r?\n/);
  const packages: string[] = [];
  let insidePackages = false;

  for (const rawLine of lines) {
    const line = stripComment(rawLine);

    if (line.trim().length === 0) {
      continue;
    }

    if (!insidePackages) {
      const packagesMatch = /^packages\s*:\s*(.*)$/.exec(line);

      if (packagesMatch === null) {
        continue;
      }

      insidePackages = true;
      const inlineValue = packagesMatch[1]?.trim() ?? "";

      if (inlineValue.startsWith("[") && inlineValue.endsWith("]")) {
        return inlineValue
          .slice(1, -1)
          .split(",")
          .map(unquoteYamlScalar)
          .filter((entry) => entry.length > 0);
      }

      continue;
    }

    if (/^\S/.test(line)) {
      break;
    }

    const listItemMatch = /^\s*-\s*(.+?)\s*$/.exec(line);

    if (listItemMatch !== null) {
      packages.push(unquoteYamlScalar(listItemMatch[1]));
    }
  }

  return packages;
};

export const pnpmWorkspaceStrategy: WorkspaceStrategy = {
  name: "pnpm-workspace",
  discover: async (root: string, fs: FileSystem): Promise<ReadonlyArray<WorkspacePackage>> => {
    const workspacePath = root === "." ? "pnpm-workspace.yaml" : `${root}/pnpm-workspace.yaml`;

    if (!(await fs.exists(workspacePath))) {
      return [];
    }

    const workspaceYaml = await fs.readFile(workspacePath);
    const rootPackageJsonPath = root === "." ? "package.json" : `${root}/package.json`;
    const rootPackage = (await fs.exists(rootPackageJsonPath))
      ? await readWorkspacePackage(rootPackageJsonPath, fs, root)
      : undefined;
    const discoveredPackages = await discoverWorkspacePackagesFromPatterns(
      root,
      fs,
      parsePnpmWorkspacePackages(workspaceYaml)
    );

    return [rootPackage, ...discoveredPackages].filter((workspacePackage): workspacePackage is WorkspacePackage => {
      return workspacePackage !== undefined;
    });
  }
};
