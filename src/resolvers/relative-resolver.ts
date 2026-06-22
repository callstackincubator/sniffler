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
    sourceExtensions: context.sourceExtensions,
    platform: context.platform
  });
};

const hasSourceExtension = (specifier: string, sourceExtensions?: ReadonlyArray<string>): boolean => {
  const extensions = sourceExtensions ?? [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  return extensions.some((extension) => specifier.endsWith(extension));
};

const shouldProbeCandidate = (specifier: string, context: ResolveContext): boolean => {
  if (extname(specifier) === "" || hasSourceExtension(specifier, context.sourceExtensions)) {
    return true;
  }

  return (context.platform?.trim() ?? "") !== "";
};

export const relativeResolver: Resolver = {
  name: "relative",
  resolve: async (specifier: string, fromFile: string, context: ResolveContext): Promise<ResolveResult> => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return { type: "unresolved", warning: "Not a relative specifier" };
    }

    if (!shouldProbeCandidate(specifier, context)) {
      return {
        type: "resolved",
        path: resolveRelativePath(specifier, fromFile),
        resolver: "relative"
      };
    }

    const resolvedPath = await resolveRelativeCandidate(specifier, fromFile, context);

    if (resolvedPath === undefined && extname(specifier) !== "") {
      return {
        type: "resolved",
        path: resolveRelativePath(specifier, fromFile),
        resolver: "relative"
      };
    }

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
