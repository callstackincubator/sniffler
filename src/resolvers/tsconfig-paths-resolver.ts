import { dirname, join } from "node:path";

import { normalizePath } from "../filesystem/path-utils.js";
import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

const isRelativeOrAbsolute = (specifier: string): boolean => {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
};

const resolveCandidate = async (candidate: string, context: ResolveContext): Promise<string | undefined> => {
  const normalizedCandidate = normalizePath(candidate);

  if (await context.fs.exists(normalizedCandidate)) {
    return normalizedCandidate;
  }

  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
  for (const extension of extensions) {
    const extendedCandidate = `${normalizedCandidate}${extension}`;
    if (await context.fs.exists(extendedCandidate)) {
      return normalizePath(extendedCandidate);
    }
  }

  return undefined;
};

const matchPattern = async (
  specifier: string,
  fromFile: string,
  pattern: string,
  replacements: ReadonlyArray<string>,
  context: ResolveContext,
  baseUrl?: string
): Promise<string | undefined> => {
  const starIndex = pattern.indexOf("*");

  if (starIndex === -1) {
    if (specifier !== pattern) {
      return undefined;
    }

    for (const replacement of replacements) {
      const root = baseUrl === undefined ? "." : baseUrl;
      const candidate = normalizePath(join(root, replacement));
      const resolved = await resolveCandidate(candidate, context);
      if (resolved !== undefined) {
        return resolved;
      }
    }

    return undefined;
  }

  const prefix = pattern.slice(0, starIndex);
  const suffix = pattern.slice(starIndex + 1);

  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
    return undefined;
  }

  const matched = specifier.slice(prefix.length, specifier.length - suffix.length);

  for (const replacement of replacements) {
    const root = baseUrl === undefined ? dirname(normalizePath(fromFile)) : baseUrl;
    const candidate = normalizePath(join(root, replacement.replace("*", matched)));
    const resolved = await resolveCandidate(candidate, context);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
};

export const tsconfigPathsResolver: Resolver = {
  name: "tsconfig-paths",
  resolve: async (specifier: string, fromFile: string, context: ResolveContext): Promise<ResolveResult> => {
    const paths = context.tsconfigPaths?.paths;

    if (paths === undefined || isRelativeOrAbsolute(specifier)) {
      return { type: "unresolved", warning: "Not a tsconfig paths specifier" };
    }

    for (const [pattern, replacements] of Object.entries(paths)) {
      const resolved = await matchPattern(
        specifier,
        fromFile,
        pattern,
        replacements,
        context,
        context.tsconfigPaths?.baseUrl
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
