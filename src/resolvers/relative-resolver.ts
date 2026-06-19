import { dirname, extname, join } from "node:path";

import { normalizePath } from "../filesystem/path-utils.js";
import { resolveSourceFileCandidate } from "./source-file-candidate.js";
import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

export const resolveRelativePath = (specifier: string, fromFile: string): string => {
  const baseDirectory = dirname(normalizePath(fromFile));
  return normalizePath(join(baseDirectory, specifier));
};

const resolveRelativeCandidate = async (
  specifier: string,
  fromFile: string,
  context: ResolveContext
): Promise<string | undefined> => {
  return resolveSourceFileCandidate(resolveRelativePath(specifier, fromFile), {
    fs: context.fs,
    sourceExtensions: context.sourceExtensions
  });
};

export const relativeResolver: Resolver = {
  name: "relative",
  resolve: async (specifier: string, fromFile: string, context: ResolveContext): Promise<ResolveResult> => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return { type: "unresolved", warning: "Not a relative specifier" };
    }

    if (extname(specifier) !== "") {
      return {
        type: "resolved",
        path: resolveRelativePath(specifier, fromFile),
        resolver: "relative"
      };
    }

    const resolvedPath = await resolveRelativeCandidate(specifier, fromFile, context);

    if (resolvedPath === undefined) {
      return {
        type: "unresolved",
        warning: `No source file matched ${specifier}`
      };
    }

    return {
      type: "resolved",
      path: resolvedPath,
      resolver: "relative"
    };
  }
};
