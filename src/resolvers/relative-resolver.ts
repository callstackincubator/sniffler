import { dirname, join } from "node:path";

import { normalizePath } from "../filesystem/path-utils.js";
import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

export const resolveRelativePath = (specifier: string, fromFile: string): string => {
  const baseDirectory = dirname(normalizePath(fromFile));
  return normalizePath(join(baseDirectory, specifier));
};

export const relativeResolver: Resolver = {
  name: "relative",
  resolve: async (specifier: string, fromFile: string, _context: ResolveContext): Promise<ResolveResult> => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return { type: "unresolved", warning: "Not a relative specifier" };
    }

    return {
      type: "resolved",
      path: resolveRelativePath(specifier, fromFile),
      resolver: "relative"
    };
  }
};
