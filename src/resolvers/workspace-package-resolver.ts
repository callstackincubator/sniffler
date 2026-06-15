import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

export const workspacePackageResolver: Resolver = {
  name: "workspace-package",
  resolve: async (specifier: string, _fromFile: string, context: ResolveContext): Promise<ResolveResult> => {
    const workspacePackages = context.workspacePackages ?? [];

    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
      return { type: "unresolved", warning: "Not a workspace package specifier" };
    }

    const workspacePackage = workspacePackages.find((entry) => entry.name === specifier);

    if (workspacePackage === undefined) {
      return { type: "external" };
    }

    return {
      type: "resolved",
      path: workspacePackage.root,
      resolver: "workspace-package"
    };
  }
};
