import type { FileSystem } from "../filesystem/filesystem.js";
import type { CacheEntry, GraphCache, LoadCacheOptions, ResolvedEdge } from "./cache-types.js";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isSourceLocation = (value: unknown): boolean => {
  return isRecord(value) && typeof value.line === "number" && typeof value.column === "number";
};

const isEntitySelection = (value: unknown): boolean => {
  if (!isRecord(value) || (value.type !== "all" && value.type !== "named")) {
    return false;
  }

  if (value.type === "all") {
    return true;
  }

  return (
    Array.isArray(value.entities) &&
    value.entities.every((entity) => {
      if (!isRecord(entity) || typeof entity.imported !== "string") {
        return false;
      }

      return entity.local === undefined || typeof entity.local === "string";
    })
  );
};

const isResolvedEdge = (value: unknown): value is ResolvedEdge => {
  const reExportsIsValid =
    value !== null &&
    isRecord(value) &&
    "reExports" in value &&
    (value.reExports === null ||
      (isRecord(value.reExports) &&
        value.reExports.type === "all") ||
      (Array.isArray(value.reExports) &&
        value.reExports.every(
          (item) => isRecord(item) && typeof item.imported === "string" && typeof item.exported === "string"
        )));

  return (
    isRecord(value) &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    typeof value.resolver === "string" &&
    isEntitySelection(value.entities) &&
    reExportsIsValid
  );
};

const isRawImportKind = (value: unknown): value is "import" | "export" | "require" | "dynamic-import" => {
  return value === "import" || value === "export" || value === "require" || value === "dynamic-import";
};

const isScanWarningType = (value: unknown): value is "unresolved-dynamic-import" | "unresolved-dynamic-require" => {
  return value === "unresolved-dynamic-import" || value === "unresolved-dynamic-require";
};

const isScanResult = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  if (!Array.isArray(value.imports) || !Array.isArray(value.warnings)) {
    return false;
  }

  return value.imports.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    if (typeof item.specifier !== "string" || !isRawImportKind(item.kind) || !isEntitySelection(item.entities)) {
      return false;
    }

    return item.loc === undefined || isSourceLocation(item.loc);
  }) &&
    Array.isArray(value.exports) &&
    value.exports.every((item) => {
      if (!isRecord(item) || typeof item.kind !== "string") {
        return false;
      }

      if (item.kind === "local") {
        return (
          typeof item.exported === "string" &&
          (item.local === undefined || typeof item.local === "string") &&
          (item.loc === undefined || isSourceLocation(item.loc))
        );
      }

      if (item.kind === "re-export") {
        return (
          typeof item.specifier === "string" &&
          typeof item.imported === "string" &&
          typeof item.exported === "string" &&
          (item.loc === undefined || isSourceLocation(item.loc))
        );
      }

      if (item.kind === "re-export-all") {
        return (
          typeof item.specifier === "string" &&
          (item.exportedNamespace === undefined || typeof item.exportedNamespace === "string") &&
          (item.loc === undefined || isSourceLocation(item.loc))
        );
      }

      return false;
    }) &&
    value.warnings.every((item) => {
      if (!isRecord(item) || !isScanWarningType(item.type) || typeof item.message !== "string") {
        return false;
      }

      return item.loc === undefined || isSourceLocation(item.loc);
    });
};

const isCacheEntry = (key: string, value: unknown): value is CacheEntry => {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    value.path === key &&
    typeof value.contentHash === "string" &&
    isScanResult(value.scan) &&
    Array.isArray(value.resolvedEdges) &&
    value.resolvedEdges.every(isResolvedEdge)
  );
};

const isGraphCache = (value: unknown): value is GraphCache => {
  if (!isRecord(value)) {
    return false;
  }

  if (value.version !== 1 || typeof value.configHash !== "string" || typeof value.scannerVersion !== "string") {
    return false;
  }

  if (!isRecord(value.files)) {
    return false;
  }

  return Object.entries(value.files).every(([key, entry]) => isCacheEntry(key, entry));
};

export const loadCache = async (
  fs: FileSystem,
  path: string,
  options: LoadCacheOptions = {}
): Promise<GraphCache | null> => {
  let cache: unknown;

  try {
    cache = await fs.readJson<unknown>(path);
  } catch {
    return null;
  }

  if (!isGraphCache(cache)) {
    return null;
  }

  if (options.configHash !== undefined && cache.configHash !== options.configHash) {
    return null;
  }

  if (options.scannerVersion !== undefined && cache.scannerVersion !== options.scannerVersion) {
    return null;
  }

  return cache;
};
