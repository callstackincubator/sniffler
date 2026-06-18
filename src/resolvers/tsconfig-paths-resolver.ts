import { dirname, isAbsolute, join, relative } from "node:path";

import { normalizePath } from "../filesystem/path-utils.js";
import { resolveSourceFileCandidate } from "./source-file-candidate.js";
import {
  compileTsconfigPathsConfig,
  type CompiledTsconfigPathsConfig,
  type ResolveContext,
  type ResolveResult,
  type Resolver
} from "./resolve-import.js";

const isRelativeOrAbsolute = (specifier: string): boolean => {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
};

const resolveCandidate = async (candidate: string, context: ResolveContext): Promise<string | undefined> => {
  return resolveSourceFileCandidate(candidate, {
    fs: context.fs,
    sourceExtensions: context.sourceExtensions
  });
};

const reportResolvedPath = (resolvedPath: string, baseUrl?: string): string => {
  const normalizedResolvedPath = normalizePath(resolvedPath);

  if (baseUrl !== undefined && isAbsolute(baseUrl) && isAbsolute(normalizedResolvedPath)) {
    return normalizePath(relative(baseUrl, normalizedResolvedPath));
  }

  return normalizedResolvedPath;
};

const getCompiledTsconfigPaths = (context: ResolveContext): CompiledTsconfigPathsConfig | undefined => {
  return context.tsconfigPathsIndex ?? (context.tsconfigPaths === undefined ? undefined : compileTsconfigPathsConfig(context.tsconfigPaths));
};

const matchPattern = async (
  specifier: string,
  fromFile: string,
  entry: {
    pattern: string;
    prefix: string;
    suffix: string;
    replacements: ReadonlyArray<string>;
  },
  context: ResolveContext,
  baseUrl?: string
): Promise<string | undefined> => {
  if (entry.prefix === entry.pattern && entry.suffix === "") {
    if (specifier !== entry.pattern) {
      return undefined;
    }

    for (const replacement of entry.replacements) {
      const root = baseUrl === undefined ? "." : baseUrl;
      const candidate = normalizePath(join(root, replacement));
      const resolved = await resolveCandidate(candidate, context);
      if (resolved !== undefined) {
        return reportResolvedPath(resolved, baseUrl);
      }
    }

    return undefined;
  }

  if (!specifier.startsWith(entry.prefix) || !specifier.endsWith(entry.suffix)) {
    return undefined;
  }

  const matched = specifier.slice(entry.prefix.length, specifier.length - entry.suffix.length);

  for (const replacement of entry.replacements) {
    const root = baseUrl === undefined ? dirname(normalizePath(fromFile)) : baseUrl;
    const candidate = normalizePath(join(root, replacement.replace("*", matched)));
    const resolved = await resolveCandidate(candidate, context);
    if (resolved !== undefined) {
      return reportResolvedPath(resolved, baseUrl);
    }
  }

  return undefined;
};

export const tsconfigPathsResolver: Resolver = {
  name: "tsconfig-paths",
  resolve: async (specifier: string, fromFile: string, context: ResolveContext): Promise<ResolveResult> => {
    const compiled = getCompiledTsconfigPaths(context);

    if (compiled === undefined || isRelativeOrAbsolute(specifier)) {
      return { type: "unresolved", warning: "Not a tsconfig paths specifier" };
    }

    for (const entry of compiled.entries) {
      const resolved = await matchPattern(
        specifier,
        fromFile,
        entry,
        context,
        compiled.baseUrl
      );

      if (resolved !== undefined) {
        return {
          type: "resolved",
          path: resolved,
          resolver: "tsconfig-paths"
        };
      }
    }

    return {
      type: "unresolved",
      warning: `No tsconfig paths mapping matched ${specifier}`
    };
  }
};
