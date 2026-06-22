import { dirname, isAbsolute, join, relative } from "node:path";

import { normalizePath } from "../filesystem/path-utils.js";
import { defaultSourceExtensions, resolveSourceFileCandidate } from "./source-file-candidate.js";
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
    sourceExtensions: context.sourceExtensions,
    platform: context.platform,
    sourceCandidateCache: context.sourceCandidateCache
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

const buildCompiledTsconfigPathsSignature = (compiled: CompiledTsconfigPathsConfig): string => {
  return compiled.entries
    .map((entry, index) => {
      return [
        index,
        entry.pattern,
        entry.prefix,
        entry.suffix,
        entry.replacements.join("\u0001")
      ].join("\u0002");
    })
    .join("\u0003");
};

const buildTsconfigPathsResolutionCacheKey = (
  specifier: string,
  fromFile: string,
  compiled: CompiledTsconfigPathsConfig,
  context: ResolveContext
): string => {
  const normalizedPlatform = context.platform?.trim() ?? "";
  const sourceExtensions = context.sourceExtensions ?? defaultSourceExtensions;
  const normalizedBaseUrl = compiled.baseUrl === undefined ? "" : normalizePath(compiled.baseUrl);
  const fromDirectory = compiled.baseUrl === undefined ? dirname(normalizePath(fromFile)) : "";
  const importKind = context.importKind ?? "import";
  const compiledSignature = buildCompiledTsconfigPathsSignature(compiled);

  return [
    specifier,
    normalizedPlatform,
    sourceExtensions.join("\u0001"),
    normalizedBaseUrl,
    importKind,
    fromDirectory,
    compiledSignature
  ].join("\u0000");
};

const isExactPattern = (entry: {
  pattern: string;
  prefix: string;
  suffix: string;
}): boolean => {
  return entry.prefix === entry.pattern && entry.suffix === "";
};

const matchesPattern = (
  specifier: string,
  entry: {
    pattern: string;
    prefix: string;
    suffix: string;
  }
): boolean => {
  if (isExactPattern(entry)) {
    return specifier === entry.pattern;
  }

  return specifier.startsWith(entry.prefix) && specifier.endsWith(entry.suffix);
};

const compareTsconfigPathEntrySpecificity = (
  left: {
    prefix: string;
    suffix: string;
    order: number;
  },
  right: {
    prefix: string;
    suffix: string;
    order: number;
  }
): number => {
  const prefixDifference = right.prefix.length - left.prefix.length;
  if (prefixDifference !== 0) {
    return prefixDifference;
  }

  const suffixDifference = right.suffix.length - left.suffix.length;
  if (suffixDifference !== 0) {
    return suffixDifference;
  }

  return left.order - right.order;
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
  if (!matchesPattern(specifier, entry)) {
    return undefined;
  }

  if (isExactPattern(entry)) {
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

    const cacheKey = buildTsconfigPathsResolutionCacheKey(specifier, fromFile, compiled, context);
    const cachedResult = context.tsconfigPathsResolutionCache?.get(cacheKey);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    const resolvedResult = (async (): Promise<ResolveResult> => {
      const matchingEntries = [...compiled.entries]
        .map((entry, order) => ({ ...entry, order }))
        .filter((entry) => matchesPattern(specifier, entry))
        .sort(compareTsconfigPathEntrySpecificity);

      for (const entry of matchingEntries) {
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
    })().catch((error: unknown) => {
      context.tsconfigPathsResolutionCache?.delete(cacheKey);
      throw error;
    });

    context.tsconfigPathsResolutionCache?.set(cacheKey, resolvedResult);

    return resolvedResult;
  }
};
