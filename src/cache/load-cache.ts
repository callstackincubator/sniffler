import type { FileSystem } from "../filesystem/filesystem.js";
import type { CacheEntry, GraphCache, LoadCacheOptions, ResolvedEdge } from "./cache-types.js";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isResolvedEdge = (value: unknown): value is ResolvedEdge => {
  return (
    isRecord(value) &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    typeof value.resolver === "string"
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

    if (typeof item.specifier !== "string" || !isRawImportKind(item.kind)) {
      return false;
    }

    return item.loc === undefined || (
      isRecord(item.loc) &&
      typeof item.loc.line === "number" &&
      typeof item.loc.column === "number"
    );
  }) &&
    value.warnings.every((item) => {
      if (!isRecord(item) || !isScanWarningType(item.type) || typeof item.message !== "string") {
        return false;
      }

      return item.loc === undefined || (
        isRecord(item.loc) &&
        typeof item.loc.line === "number" &&
        typeof item.loc.column === "number"
      );
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
