import type { ScanResult } from "../scanner/scanner-types.js";

export type ResolvedEdge = {
  from: string;
  to: string;
  resolver: string;
};

export type CacheEntry = {
  path: string;
  contentHash: string;
  scan: ScanResult;
  resolvedEdges: ReadonlyArray<ResolvedEdge>;
};

export type GraphCache = {
  version: 1;
  configHash: string;
  scannerVersion: string;
  files: Record<string, CacheEntry>;
};

export type LoadCacheOptions = {
  configHash?: string;
  scannerVersion?: string;
};
