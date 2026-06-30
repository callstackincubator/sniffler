import type { EntitySelection, RawExport, ScanResult } from "../scanner/scanner-types.js";

export type ResolvedEdge = {
  from: string;
  to: string;
  resolver: string;
  entities: EntitySelection;
  reExports:
    | ReadonlyArray<{
        imported: string;
        exported: string;
      }>
    | {
        type: "all";
      }
    | null;
  synthetic?:
    | {
        kind: "containment";
        from: string;
        to: string;
      }
    | undefined;
};

export type CacheEntry = {
  path: string;
  contentHash: string;
  metadata?: SourceFileMetadata;
  scan: ScanResult;
  resolvedEdges: ReadonlyArray<ResolvedEdge>;
};

export type SourceFileMetadata = {
  size: number;
  mtimeMs: number;
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
