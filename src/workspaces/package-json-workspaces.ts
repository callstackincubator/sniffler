import type { FileSystem } from "../filesystem/filesystem.js";
import type { WorkspacePackage, WorkspaceStrategy } from "./discover-workspaces.js";

export const packageJsonWorkspacesStrategy: WorkspaceStrategy = {
  name: "package-json",
  discover: async (_root: string, _fs: FileSystem): Promise<ReadonlyArray<WorkspacePackage>> => {
    return [];
  }
};
