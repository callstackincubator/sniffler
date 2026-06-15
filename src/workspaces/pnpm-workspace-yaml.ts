import type { FileSystem } from "../filesystem/filesystem.js";
import type { WorkspacePackage, WorkspaceStrategy } from "./discover-workspaces.js";

export const pnpmWorkspaceStrategy: WorkspaceStrategy = {
  name: "pnpm-workspace",
  discover: async (_root: string, _fs: FileSystem): Promise<ReadonlyArray<WorkspacePackage>> => {
    return [];
  }
};
