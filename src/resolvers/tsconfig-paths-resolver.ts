import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

export const tsconfigPathsResolver: Resolver = {
  name: "tsconfig-paths",
  resolve: async (_specifier: string, _fromFile: string, _context: ResolveContext): Promise<ResolveResult> => {
    return { type: "unresolved", warning: "TSConfig paths resolver not implemented yet" };
  }
};
