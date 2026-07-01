import { join } from "node:path";
import type { GraphCache, ResolvedEdge, CacheEntry } from "../cache/cache-types.js";
import { createGraphCacheStore, type GraphCacheStore } from "../cache/cache-store.js";
import { getCacheConfigHash, SCANNER_VERSION } from "../cache/cache-key.js";
import { loadCache } from "../cache/load-cache.js";
import { saveCache } from "../cache/save-cache.js";
import type { StaleChecker } from "../cache/stale-checker.js";
import type { SnifflerConfig } from "../config/config-schema.js";
import { normalizePath } from "../filesystem/path-utils.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import type { GraphNode, DependencyGraph } from "../graph/build-graph.js";
import { resolveSourceScanner } from "../scanner/source-scanner.js";
import type { Diagnostics } from "../diagnostics/diagnostics.js";

export type ImpactCacheScanState = {
  graphNodes: ReadonlyArray<GraphNode>;
  warnings: ReadonlyArray<string>;
  cachePath?: string;
  configHash: string;
  cacheNeedsRefresh: boolean;
  stagedEntries: Record<string, CacheEntry>;
  contentHashes: Map<string, string>;
};

export type ImpactCacheLifecycleInput = {
  fs: FileSystem;
  cwd: string;
  config: SnifflerConfig;
  diagnostics: Diagnostics;
  staleChecker: StaleChecker;
  cacheStoreFactory?: (input: { cache: GraphCache | null; staleChecker: StaleChecker }) => GraphCacheStore;
  platform?: string;
  sourceFiles: ReadonlyArray<string>;
};

const loadCacheForImpact = async (input: ImpactCacheLifecycleInput): Promise<{
  cache: GraphCache | null;
  cachePath?: string;
  configHash: string;
}> => {
  const cachePath = input.config.cache?.path === undefined ? undefined : normalizePath(join(input.cwd, input.config.cache.path));
  const configHash = getCacheConfigHash(input.config, { platform: input.platform });
  const cache =
    cachePath === undefined
      ? null
      : await input.diagnostics.time("impact.cache.load", async () => {
          return await loadCache(input.fs, cachePath, {
            configHash,
            scannerVersion: SCANNER_VERSION
          });
        });

  return {
    cache,
    cachePath,
    configHash
  };
};

const createGraphCache = async (input: {
  fs: FileSystem;
  cache: GraphCache | null;
  cachePath?: string;
  configHash: string;
  staleChecker: StaleChecker;
  cacheStoreFactory?: (input: { cache: GraphCache | null; staleChecker: StaleChecker }) => GraphCacheStore;
  diagnostics: Diagnostics;
  sourceFiles: ReadonlyArray<string>;
  cwd: string;
  workers?: "auto" | number;
}): Promise<ImpactCacheScanState> => {
  const warnings: string[] = [];
  const graphNodes: GraphNode[] = [];
  const cacheEntries = input.cache?.files ?? {};
  input.diagnostics.record("cacheEntries", Object.keys(cacheEntries).length);
  input.diagnostics.record("sourceFiles", input.sourceFiles.length);
  const canReuseCachedResolvedEdges =
    input.cachePath !== undefined && input.cache !== null && Object.keys(cacheEntries).length === input.sourceFiles.length;
  const cacheStore =
    input.cacheStoreFactory?.({ cache: input.cache, staleChecker: input.staleChecker }) ??
    createGraphCacheStore(input.cache, input.staleChecker);
  const contentHashes = new Map<string, string>();
  const sourceFileStates: Array<{
    path: string;
    cacheEntry: CacheEntry | null;
  }> = [];
  const missPaths: string[] = [];
  let cacheNeedsRefresh = input.cache === null || !canReuseCachedResolvedEdges;
  let cacheScanHits = 0;
  let cacheScanMisses = 0;
  let cachedResolvedEdgeFiles = 0;

  await input.diagnostics.time("impact.sources.scan", async () => {
    for (const path of input.sourceFiles) {
      const cacheEntry = await cacheStore.getEntry(path);
      sourceFileStates.push({
        path,
        cacheEntry
      });

      if (cacheEntry !== null) {
        cacheScanHits += 1;
      } else {
        cacheScanMisses += 1;
        cacheNeedsRefresh = true;
        missPaths.push(path);
      }
    }

    const sourceScanner = resolveSourceScanner({
      fs: input.fs,
      cwd: input.cwd,
      workers: input.workers,
      missCount: missPaths.length
    });
    input.diagnostics.record("sourceScannerMode", sourceScanner.mode);
    input.diagnostics.record("sourceScannerWorkers", sourceScanner.workers);
    input.diagnostics.record("sourceScannerJobs", missPaths.length);
    input.diagnostics.record("sourceScannerWorkerFailures", 0);

    let missResults: ReadonlyArray<{
      path: string;
      scan: CacheEntry["scan"];
      contentHash: string;
      metadata?: CacheEntry["metadata"];
    }> = [];

    try {
      missResults = missPaths.length === 0 ? [] : await sourceScanner.scan(missPaths);
    } catch (error) {
      if (sourceScanner.mode === "worker") {
        input.diagnostics.increment("sourceScannerWorkerFailures");
      }

      throw error;
    }

    const missResultsByPath = new Map(missResults.map((entry) => [entry.path, entry] as const));

    for (const { path, cacheEntry } of sourceFileStates) {
      const canReuseCachedEntry = cacheEntry !== null;
      const scan = cacheEntry?.scan ?? missResultsByPath.get(path)?.scan;
      const contentHash = cacheEntry?.contentHash ?? missResultsByPath.get(path)?.contentHash;
      const metadata = cacheEntry?.metadata ?? missResultsByPath.get(path)?.metadata;

      if (scan === undefined || contentHash === undefined) {
        throw new Error(`Missing scan result for ${path}`);
      }

      contentHashes.set(path, contentHash);

      if (canReuseCachedResolvedEdges && canReuseCachedEntry) {
        cachedResolvedEdgeFiles += 1;
      }

      for (const warning of scan.warnings) {
        warnings.push(warning.message);
        input.diagnostics.warning({
          source: "scanner",
          type: warning.type,
          message: warning.message,
          file: path,
          ...(warning.loc === undefined
            ? {}
            : {
                location: {
                  line: warning.loc.line,
                  column: warning.loc.column
                }
              })
        });
      }

      const graphNode: GraphNode = {
        path,
        scan,
        resolvedEdges: canReuseCachedResolvedEdges && canReuseCachedEntry ? cacheEntry.resolvedEdges : undefined
      };

      graphNodes.push(graphNode);
      cacheStore.setEntry(path, {
        path,
        contentHash,
        ...(metadata === undefined ? {} : { metadata }),
        scan,
        resolvedEdges: graphNode.resolvedEdges ?? []
      });
    }
  });
  input.diagnostics.record("cacheScanHits", cacheScanHits);
  input.diagnostics.record("cacheScanMisses", cacheScanMisses);
  input.diagnostics.record("cachedResolvedEdgeFiles", cachedResolvedEdgeFiles);
  input.diagnostics.record("graphNodes", graphNodes.length);

  return {
    graphNodes,
    warnings,
    cachePath: input.cachePath,
    configHash: input.configHash,
    cacheNeedsRefresh,
    stagedEntries: cacheStore.entries(),
    contentHashes
  };
};

export const prepareImpactCacheState = async (input: ImpactCacheLifecycleInput): Promise<ImpactCacheScanState> => {
  const loaded = await loadCacheForImpact(input);

  return await createGraphCache({
    fs: input.fs,
    cache: loaded.cache,
    cachePath: loaded.cachePath,
    configHash: loaded.configHash,
    staleChecker: input.staleChecker,
    cacheStoreFactory: input.cacheStoreFactory,
    diagnostics: input.diagnostics,
    sourceFiles: input.sourceFiles,
    cwd: input.cwd,
    workers: input.config.workers
  });
};

export const saveImpactCache = async (input: {
  fs: FileSystem;
  diagnostics: Diagnostics;
  state: ImpactCacheScanState;
  graph: DependencyGraph;
}): Promise<void> => {
  const cachePath = input.state.cachePath;

  if (cachePath === undefined || !input.state.cacheNeedsRefresh) {
    return;
  }

  await input.diagnostics.time("impact.cache.save", async () => {
    const resolvedEdgesByFrom = new Map<string, Array<ResolvedEdge>>();

    for (const edge of input.graph.edges) {
      const existing = resolvedEdgesByFrom.get(edge.from);

      if (existing === undefined) {
        resolvedEdgesByFrom.set(edge.from, [edge]);
        continue;
      }

      existing.push(edge);
    }

    const nextCache: GraphCache = {
      version: 1,
      configHash: input.state.configHash,
      scannerVersion: SCANNER_VERSION,
      files: Object.fromEntries(
        input.graph.nodes.map((node) => [
          node.path,
          {
            path: node.path,
            contentHash: input.state.contentHashes.get(node.path) ?? "",
            ...(input.state.stagedEntries[node.path]?.metadata === undefined
              ? {}
              : { metadata: input.state.stagedEntries[node.path].metadata }),
            scan: node.scan,
            resolvedEdges: resolvedEdgesByFrom.get(node.path) ?? []
          } satisfies CacheEntry
        ])
      )
    };

    try {
      await saveCache(input.fs, cachePath, nextCache);
    } catch {
      // Ignore cache write failure. Impact result must still complete.
    }
  });
};
