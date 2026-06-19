import { join } from "node:path";

import { normalizePath } from "../filesystem/path-utils.js";
import type { ResolveContext, ResolveResult, Resolver } from "./resolve-import.js";

const defaultImportConditions = ["import", "node", "default"] as const;
const defaultRequireConditions = ["require", "node", "default"] as const;
const candidateExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const statIfFile = async (path: string, context: ResolveContext): Promise<string | undefined> => {
  const normalizedPath = normalizePath(path);

  try {
    const stat = await context.fs.stat(normalizedPath);
    return stat.isFile ? normalizedPath : undefined;
  } catch {
    return undefined;
  }
};

const parsePackageSpecifier = (
  specifier: string
): { packageName: string; subpathKey: string } | undefined => {
  if (specifier.startsWith("@")) {
    const firstSlash = specifier.indexOf("/", 1);

    if (firstSlash === -1) {
      return undefined;
    }

    const secondSlash = specifier.indexOf("/", firstSlash + 1);

    if (secondSlash === -1) {
      return {
        packageName: specifier,
        subpathKey: "."
      };
    }

    return {
      packageName: specifier.slice(0, secondSlash),
      subpathKey: `./${specifier.slice(secondSlash + 1)}`
    };
  }

  const slashIndex = specifier.indexOf("/");

  if (slashIndex === -1) {
    return {
      packageName: specifier,
      subpathKey: "."
    };
  }

  return {
    packageName: specifier.slice(0, slashIndex),
    subpathKey: `./${specifier.slice(slashIndex + 1)}`
  };
};

const resolveCandidate = async (candidate: string, context: ResolveContext): Promise<string | undefined> => {
  const normalizedCandidate = normalizePath(candidate);

  const exactMatch = await statIfFile(normalizedCandidate, context);
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  for (const extension of candidateExtensions) {
    const extendedCandidate = `${normalizedCandidate}${extension}`;

    const resolved = await statIfFile(extendedCandidate, context);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
};

const resolveTarget = async (
  packageRoot: string,
  target: unknown,
  context: ResolveContext,
  allowedConditions: ReadonlyArray<string>,
  matchedPattern?: string
): Promise<string | undefined> => {
  if (typeof target === "string") {
    const resolvedTarget =
      matchedPattern === undefined ? target : target.includes("*") ? target.replace("*", matchedPattern) : target;

    return resolveCandidate(normalizePath(join(packageRoot, resolvedTarget)), context);
  }

  if (!isRecord(target)) {
    return undefined;
  }

  for (const [condition, value] of Object.entries(target)) {
    if (!allowedConditions.includes(condition)) {
      continue;
    }

    const resolved = await resolveTarget(packageRoot, value, context, allowedConditions, matchedPattern);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
};

const matchExportKey = (exportKey: string, subpathKey: string): string | undefined => {
  if (exportKey === subpathKey) {
    return "";
  }

  const starIndex = exportKey.indexOf("*");

  if (starIndex === -1) {
    return undefined;
  }

  const prefix = exportKey.slice(0, starIndex);
  const suffix = exportKey.slice(starIndex + 1);

  if (!subpathKey.startsWith(prefix) || !subpathKey.endsWith(suffix)) {
    return undefined;
  }

  return subpathKey.slice(prefix.length, subpathKey.length - suffix.length);
};

export const packageExportsResolver: Resolver = {
  name: "package-exports",
  resolve: async (specifier: string, _fromFile: string, context: ResolveContext): Promise<ResolveResult> => {
    const parsedSpecifier = parsePackageSpecifier(specifier);

    if (parsedSpecifier === undefined) {
      return { type: "external" };
    }

    const workspacePackage =
      context.workspacePackagesByName?.get(parsedSpecifier.packageName) ??
      (context.workspacePackages ?? []).find((entry) => entry.name === parsedSpecifier.packageName);

    if (workspacePackage === undefined) {
      return { type: "external" };
    }

    if (workspacePackage.exports === undefined) {
      return { type: "unresolved", warning: "Workspace package has no exports map" };
    }

    const packageExports = workspacePackage.exports;
    const allowedConditions =
      context.importKind === "require"
        ? context.conditions?.require ?? defaultRequireConditions
        : context.conditions?.import ?? defaultImportConditions;

    if (typeof packageExports === "string" || isRecord(packageExports)) {
      if (typeof packageExports === "string") {
        if (parsedSpecifier.subpathKey !== ".") {
          return { type: "external" };
        }

        const resolved = await resolveTarget(workspacePackage.root, packageExports, context, allowedConditions);
        if (resolved !== undefined) {
          return {
            type: "resolved",
            path: resolved,
            resolver: "package-exports"
          };
        }

        return { type: "external" };
      }

      for (const [exportKey, target] of Object.entries(packageExports)) {
        const matchedPattern = matchExportKey(exportKey, parsedSpecifier.subpathKey);

        if (matchedPattern === undefined) {
          continue;
        }

        const resolved = await resolveTarget(
          workspacePackage.root,
          target,
          context,
          allowedConditions,
          matchedPattern
        );

        if (resolved !== undefined) {
          return {
            type: "resolved",
            path: resolved,
            resolver: "package-exports"
          };
        }

        return { type: "external" };
      }

      return { type: "external" };
    }

    return {
      type: "unresolved",
      warning: "Workspace package exports must be a string or object"
    };
  }
};
