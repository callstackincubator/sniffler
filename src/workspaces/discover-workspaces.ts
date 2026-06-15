import type { FileSystem } from "../filesystem/filesystem.js";

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
