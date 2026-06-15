import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

export const relativeResolver: Resolver = {
  name: "relative",
  resolve: async (specifier: string, fromFile: string, _context: ResolveContext): Promise<ResolveResult> => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return { type: "unresolved", warning: "Not a relative specifier" };
    }

    const baseDirectory = fromFile.slice(0, Math.max(fromFile.lastIndexOf("/"), 0));
    return {
      type: "resolved",
      path: `${baseDirectory}/${specifier}`,
      resolver: "relative"
    };
  }
};
