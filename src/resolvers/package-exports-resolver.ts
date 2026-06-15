import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

export const packageExportsResolver: Resolver = {
  name: "package-exports",
  resolve: async (_specifier: string, _fromFile: string, _context: ResolveContext): Promise<ResolveResult> => {
    return { type: "unresolved", warning: "Package exports resolver not implemented yet" };
  }
};
