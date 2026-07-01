import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { SCANNER_VERSION, getCacheConfigHash } from "../cache/cache-key.js";
import type { CacheEntry, GraphCache, ResolvedEdge } from "../cache/cache-types.js";
import { createGraphCacheStore, type GraphCacheStore } from "../cache/cache-store.js";
import { loadCache } from "../cache/load-cache.js";
import { saveCache } from "../cache/save-cache.js";
import { readSourceFileMetadata, type StaleChecker } from "../cache/stale-checker.js";
import type { SnifflerConfig } from "../config/config-schema.js";
import { normalizePath } from "../filesystem/path-utils.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { buildGraph, type GraphNode, type DependencyGraph } from "../graph/build-graph.js";
import { scanFileText } from "../scanner/scan-file.js";
import { discoverWorkspaces } from "../workspaces/discover-workspaces.js";
import { packageJsonWorkspacesStrategy } from "../workspaces/package-json-workspaces.js";
import { pnpmWorkspaceStrategy } from "../workspaces/pnpm-workspace-yaml.js";
import type { TsconfigPathsConfig } from "../resolvers/resolve-import.js";
import type { Diagnostics } from "../diagnostics/diagnostics.js";

export type ImpactGraphWorkflowResult = {
  graph: DependencyGraph;
  warnings: ReadonlyArray<string>;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const hashText = (text: string): string => {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
};

const normalizePlatform = (platform?: string): string | undefined => {
  const trimmed = platform?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const discoverSourceFiles = async (
  fs: FileSystem,
  cwd: string,
  config: SnifflerConfig
): Promise<Array<string>> => {
  const roots = config.source?.roots ?? [];
  const extensions = config.source?.extensions ?? [];
  const ignorePatterns = config.source?.ignore ?? [];

  const pruneDirectories = config.source?.includeNodeModules === true ? [] : ["node_modules"];

  if (roots.length === 0 || extensions.length === 0) {
    return [];
  }

  return (
    await fs.glob(
      sortUniqueStrings(
        roots.flatMap((root) => {
          const normalizedRoot = normalizePath(root);
          const rootPrefix = normalizedRoot === "." ? "" : `${normalizedRoot}/`;

          return extensions.map((extension) => `${rootPrefix}**/*${extension}`);
        })
      ),
      {
        cwd,
        dot: true,
        ignore: ignorePatterns,
        pruneDirectories
      }
    )
  )
    .map((path) => normalizePath(path))
    .sort((left, right) => left.localeCompare(right));
};

const loadTsconfigPaths = async (
  fs: FileSystem,
  cwd: string,
  config: SnifflerConfig
): Promise<TsconfigPathsConfig | undefined> => {
  const tsconfigPath = config.resolver?.tsconfig;

  if (tsconfigPath === undefined) {
    return undefined;
  }

  const resolvedTsconfigPath = normalizePath(join(cwd, tsconfigPath));

  if (!(await fs.exists(resolvedTsconfigPath))) {
    return undefined;
  }

  let rawTsconfig: unknown;

  try {
    rawTsconfig = await fs.readJson<unknown>(resolvedTsconfigPath);
  } catch {
    return undefined;
  }

  if (typeof rawTsconfig !== "object" || rawTsconfig === null || Array.isArray(rawTsconfig)) {
    return undefined;
  }

  const compilerOptions = "compilerOptions" in rawTsconfig ? (rawTsconfig as Record<string, unknown>).compilerOptions : undefined;

  if (typeof compilerOptions !== "object" || compilerOptions === null || Array.isArray(compilerOptions)) {
    return undefined;
  }

  const pathsValue = "paths" in compilerOptions ? (compilerOptions as Record<string, unknown>).paths : undefined;
  const baseUrlValue = "baseUrl" in compilerOptions ? (compilerOptions as Record<string, unknown>).baseUrl : undefined;

  if (typeof pathsValue !== "object" || pathsValue === null || Array.isArray(pathsValue)) {
    return undefined;
  }

  const paths: Record<string, ReadonlyArray<string>> = {};

  for (const [key, value] of Object.entries(pathsValue as Record<string, unknown>)) {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
      continue;
    }

    paths[key] = value;
  }

  if (Object.keys(paths).length === 0) {
    return undefined;
  }

  const baseUrl =
    typeof baseUrlValue === "string"
      ? normalizePath(join(dirname(resolvedTsconfigPath), baseUrlValue))
      : normalizePath(dirname(resolvedTsconfigPath));

  return {
    baseUrl,
    paths
  };
};

const buildWorkspaceStrategies = (config: SnifflerConfig) => {
  return [
    ...(config.workspaces?.strategies?.includes("package-json") ? [packageJsonWorkspacesStrategy] : []),
    ...(config.workspaces?.strategies?.includes("pnpm-workspace") ? [pnpmWorkspaceStrategy] : [])
  ];
};

export const prepareImpactGraph = async (input: {
  fs: FileSystem;
  cwd: string;
  config: SnifflerConfig;
  diagnostics: Diagnostics;
  staleChecker: StaleChecker;
  cacheStoreFactory?: (input: { cache: GraphCache | null; staleChecker: StaleChecker }) => GraphCacheStore;
  platform?: string;
}): Promise<ImpactGraphWorkflowResult> => {
  const config = input.config;
  const platform = normalizePlatform(input.platform);
  const configHash = getCacheConfigHash(config, { platform });
  const cachePath = config.cache?.path === undefined ? undefined : normalizePath(join(input.cwd, config.cache.path));
  const cache =
    cachePath === undefined
      ? null
      : await input.diagnostics.time("impact.cache.load", async () => {
          return await loadCache(input.fs, cachePath, {
            configHash,
            scannerVersion: SCANNER_VERSION
          });
        });
  const workspacePackages = await input.diagnostics.time("impact.workspaces.discover", async () => {
    return await discoverWorkspaces(input.cwd, input.fs, buildWorkspaceStrategies(config));
  });
  const tsconfigPaths = await input.diagnostics.time("impact.tsconfig.load", async () => {
    return await loadTsconfigPaths(input.fs, input.cwd, config);
  });
  const sourceFiles = await input.diagnostics.time("impact.sources.discover", async () => {
    return await discoverSourceFiles(input.fs, input.cwd, config);
  });
  const warnings: string[] = [];
  const graphNodes: GraphNode[] = [];
  const cacheEntries = cache?.files ?? {};
  input.diagnostics.record("cacheEntries", Object.keys(cacheEntries).length);
  input.diagnostics.record("sourceFiles", sourceFiles.length);
  const canReuseCachedResolvedEdges =
    cachePath !== undefined && cache !== null && Object.keys(cacheEntries).length === sourceFiles.length;
  const cacheStore =
    input.cacheStoreFactory?.({ cache, staleChecker: input.staleChecker }) ??
    createGraphCacheStore(cache, input.staleChecker);
  const contentHashes = new Map<string, string>();
  let cacheNeedsRefresh = cache === null || !canReuseCachedResolvedEdges;
  let cacheScanHits = 0;
  let cacheScanMisses = 0;
  let cachedResolvedEdgeFiles = 0;

  await input.diagnostics.time("impact.sources.scan", async () => {
    for (const path of sourceFiles) {
      const cacheEntry = await cacheStore.getEntry(path);
      const canReuseCachedEntry = cacheEntry !== null;
      let scan: CacheEntry["scan"];
      let contentHash: string;

      if (cacheEntry !== null) {
        scan = cacheEntry.scan;
        contentHash = cacheEntry.contentHash;
      } else {
        const text = await input.fs.readFile(path);
        scan = scanFileText({ filePath: path, text });
        contentHash = hashText(text);
      }

      const metadata = cacheEntry === null ? await readSourceFileMetadata(input.fs, path) : cacheEntry.metadata;
      contentHashes.set(path, contentHash);

      if (canReuseCachedEntry) {
        cacheScanHits += 1;
      } else {
        cacheScanMisses += 1;
        cacheNeedsRefresh = true;
      }

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
  const stagedEntries = cacheStore.entries();

  const graph = await input.diagnostics.time("impact.graph.build", async () => {
    return await buildGraph(graphNodes, {
      diagnostics: input.diagnostics,
      graph: config.graph,
      resolveContext: {
        fs: input.fs,
        workspacePackages,
        sourceExtensions: config.source?.extensions,
        platform,
        tsconfigPaths,
        conditions: config.resolver?.conditions
      }
    });
  });

  for (const warning of graph.warnings) {
    warnings.push(warning.message);
    input.diagnostics.warning(warning);
  }
  input.diagnostics.record("graphEdges", graph.edges.length);

  if (cachePath !== undefined && cacheNeedsRefresh) {
    await input.diagnostics.time("impact.cache.save", async () => {
      const resolvedEdgesByFrom = new Map<string, Array<ResolvedEdge>>();

      for (const edge of graph.edges) {
        const existing = resolvedEdgesByFrom.get(edge.from);

        if (existing === undefined) {
          resolvedEdgesByFrom.set(edge.from, [edge]);
          continue;
        }

        existing.push(edge);
      }

      const nextCache: GraphCache = {
        version: 1,
        configHash,
        scannerVersion: SCANNER_VERSION,
        files: Object.fromEntries(
          graph.nodes.map((node) => [
            node.path,
            {
              path: node.path,
              contentHash: contentHashes.get(node.path) ?? "",
              ...(stagedEntries[node.path]?.metadata === undefined ? {} : { metadata: stagedEntries[node.path].metadata }),
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
  }

  return {
    graph,
    warnings
  };
};
