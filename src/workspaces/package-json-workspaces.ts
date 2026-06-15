import type { FileSystem } from "../filesystem/filesystem.js";
import {
  discoverWorkspacePackagesFromPatterns,
  type WorkspacePackage,
  type WorkspaceStrategy
} from "./discover-workspaces.js";

type PackageJsonWorkspaceConfig = {
  workspaces?: unknown;
};

const isStringArray = (value: unknown): value is ReadonlyArray<string> => {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
};

const getWorkspacePatterns = (packageJson: PackageJsonWorkspaceConfig): ReadonlyArray<string> => {
  if (isStringArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  }

  if (
    typeof packageJson.workspaces === "object" &&
    packageJson.workspaces !== null &&
    "packages" in packageJson.workspaces &&
    isStringArray(packageJson.workspaces.packages)
  ) {
    return packageJson.workspaces.packages;
  }

  return [];
};

export const packageJsonWorkspacesStrategy: WorkspaceStrategy = {
  name: "package-json",
  discover: async (root: string, fs: FileSystem): Promise<ReadonlyArray<WorkspacePackage>> => {
    const packageJsonPath = root === "." ? "package.json" : `${root}/package.json`;

    if (!(await fs.exists(packageJsonPath))) {
      return [];
    }

    const packageJson = await fs.readJson<PackageJsonWorkspaceConfig>(packageJsonPath);
    return discoverWorkspacePackagesFromPatterns(root, fs, getWorkspacePatterns(packageJson));
  }
};
