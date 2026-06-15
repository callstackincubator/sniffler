import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

export const workspacePackageResolver: Resolver = {
  name: "workspace-package",
  resolve: async (_specifier: string, _fromFile: string, _context: ResolveContext): Promise<ResolveResult> => {
    return { type: "unresolved", warning: "Workspace package resolver not implemented yet" };
  }
};
