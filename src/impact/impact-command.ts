import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { SCANNER_VERSION, getCacheConfigHash } from "../cache/cache-key.js";
import type { CacheEntry, GraphCache, ResolvedEdge } from "../cache/cache-types.js";
import { createGraphCacheStore, type GraphCacheStore } from "../cache/cache-store.js";
import { loadCache } from "../cache/load-cache.js";
import { saveCache } from "../cache/save-cache.js";
import {
  createContentHashStaleChecker,
  createMetadataStaleChecker,
  readSourceFileMetadata,
  type StaleChecker
} from "../cache/stale-checker.js";
import type { SnifflerConfig, SnifflerOutputFormat } from "../config/config-schema.js";
import { loadConfig } from "../config/load-config.js";
import { normalizePath } from "../filesystem/path-utils.js";
import { createNodeFileSystem } from "../filesystem/node-filesystem.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { buildGraph, type GraphNode } from "../graph/build-graph.js";
import { traverseImpact } from "../graph/traverse-impact.js";
import { renderJsonOutput } from "../output/json-output.js";
import type { ImpactOutput } from "../output/output-types.js";
import { renderTextOutput } from "../output/text-output.js";
import { scanFileText } from "../scanner/scan-file.js";
import { loadTestMap } from "../test-map/load-test-map.js";
import { matchTests } from "../test-map/match-tests.js";
import { discoverWorkspaces } from "../workspaces/discover-workspaces.js";
import { packageJsonWorkspacesStrategy } from "../workspaces/package-json-workspaces.js";
import { pnpmWorkspaceStrategy } from "../workspaces/pnpm-workspace-yaml.js";
import type { TsconfigPathsConfig } from "../resolvers/resolve-import.js";
import { noopDiagnostics, type Diagnostics } from "../diagnostics/diagnostics.js";

export type ImpactCommandInput = {
  base?: string;
  head?: string;
  changedFiles?: ReadonlyArray<string>;
  configPath?: string;
  format?: SnifflerOutputFormat;
  platform?: string;
};

export type SelectImpactInput = ImpactCommandInput;

export type ImpactCommandResult = {
  exitCode: number;
  output: string;
  impact?: ImpactOutput;
};

export type GitDiffProvider = (input: {
  base: string;
  head: string;
  cwd: string;
}) => Promise<ReadonlyArray<string>>;

export type ImpactCommandDeps = {
  fs?: FileSystem;
  cwd?: string;
  gitDiff?: GitDiffProvider;
  diagnostics?: Diagnostics;
  staleChecker?: StaleChecker;
  cacheStoreFactory?: (input: { cache: GraphCache | null; staleChecker: StaleChecker }) => GraphCacheStore;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const hashText = (text: string): string => {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
};

const getFs = (deps: ImpactCommandDeps): FileSystem => {
  return deps.fs ?? createNodeFileSystem();
};

const getCwd = (deps: ImpactCommandDeps): string => {
  return normalizePath(deps.cwd ?? process.cwd());
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

  if (roots.length === 0 || extensions.length === 0) {
    return [];
  }

  const includePatterns = sortUniqueStrings(
    roots.flatMap((root) => {
      const normalizedRoot = normalizePath(root);
      const rootPrefix = normalizedRoot === "." ? "" : `${normalizedRoot}/`;

      return extensions.map((extension) => `${rootPrefix}**/*${extension}`);
    })
  );
  const pruneDirectories = config.source?.includeNodeModules === true ? [] : ["node_modules"];

  const discovered = (
    await fs.glob(includePatterns, {
      cwd,
      dot: true,
      ignore: ignorePatterns,
      pruneDirectories
    })
  )
    .map((path) => normalizePath(path))
    .sort((left, right) => left.localeCompare(right));

  return discovered;
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

const resolveChangedFilesFromGit = async (
  input: ImpactCommandInput,
  deps: ImpactCommandDeps,
  cwd: string
): Promise<Array<string>> => {
  if (input.changedFiles !== undefined && input.changedFiles.length > 0) {
    return sortUniqueStrings(input.changedFiles.map((path) => normalizePath(path)));
  }

  if (input.base === undefined) {
    return [];
  }

  const gitDiff =
    deps.gitDiff ??
    (async ({ base, head, cwd: nextCwd }) => {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const args = ["diff", "--name-only", base, head];
      const result = await execFileAsync("git", args, { cwd: nextCwd });
      return String(result.stdout)
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter((path) => path.length > 0);
    });

  const head = input.head ?? "HEAD";
  const changedFiles = await gitDiff({
    base: input.base,
    head,
    cwd
  });

  return sortUniqueStrings(changedFiles.map((path) => normalizePath(path)));
};

export const selectImpact = async (
  input: SelectImpactInput,
  deps: ImpactCommandDeps
): Promise<ImpactOutput> => {
  const fs = getFs(deps);
  const cwd = getCwd(deps);
  const diagnostics = deps.diagnostics ?? noopDiagnostics;
  const config = (
    await diagnostics.time("impact.config.load", async () => {
      return await loadConfig({ fs, configPath: input.configPath });
    })
  ).config;
  const platform = normalizePlatform(input.platform);
  const staleChecker =
    deps.staleChecker ??
    (config.cache?.stale === "metadata" ? createMetadataStaleChecker(fs) : createContentHashStaleChecker(fs));
  const configHash = getCacheConfigHash(config, { platform });
  const cachePath = config.cache?.path === undefined ? undefined : normalizePath(join(cwd, config.cache.path));
  const cache =
    cachePath === undefined
      ? null
      : await diagnostics.time("impact.cache.load", async () => {
          return await loadCache(fs, cachePath, {
            configHash,
            scannerVersion: SCANNER_VERSION
          });
        });
  const changedFiles = await diagnostics.time("impact.changedFiles.resolve", async () => {
    return await resolveChangedFilesFromGit(input, deps, cwd);
  });
  const workspaceStrategies = [
    ...(config.workspaces?.strategies?.includes("package-json") ? [packageJsonWorkspacesStrategy] : []),
    ...(config.workspaces?.strategies?.includes("pnpm-workspace") ? [pnpmWorkspaceStrategy] : [])
  ];
  const workspacePackages = await diagnostics.time("impact.workspaces.discover", async () => {
    return await discoverWorkspaces(cwd, fs, workspaceStrategies);
  });
  const tsconfigPaths = await diagnostics.time("impact.tsconfig.load", async () => {
    return await loadTsconfigPaths(fs, cwd, config);
  });
  const sourceFiles = await diagnostics.time("impact.sources.discover", async () => {
    return await discoverSourceFiles(fs, cwd, config);
  });
  const warnings: string[] = [];
  const graphNodes: GraphNode[] = [];
  const cacheEntries = cache?.files ?? {};
  diagnostics.record("cacheEntries", Object.keys(cacheEntries).length);
  diagnostics.record("sourceFiles", sourceFiles.length);
  const canReuseCachedResolvedEdges =
    cachePath !== undefined && cache !== null && Object.keys(cacheEntries).length === sourceFiles.length;
  const cacheStore = deps.cacheStoreFactory?.({ cache, staleChecker }) ?? createGraphCacheStore(cache, staleChecker);
  const contentHashes = new Map<string, string>();
  let cacheNeedsRefresh = cache === null || !canReuseCachedResolvedEdges;
  let cacheScanHits = 0;
  let cacheScanMisses = 0;
  let cachedResolvedEdgeFiles = 0;

  await diagnostics.time("impact.sources.scan", async () => {
    for (const path of sourceFiles) {
      const cacheEntry = await cacheStore.getEntry(path);
      const canReuseCachedEntry = cacheEntry !== null;
      let scan: CacheEntry["scan"];
      let contentHash: string;

      if (cacheEntry !== null) {
        scan = cacheEntry.scan;
        contentHash = cacheEntry.contentHash;
      } else {
        const text = await fs.readFile(path);
        scan = scanFileText({ filePath: path, text });
        contentHash = hashText(text);
      }
      const metadata = cacheEntry === null ? await readSourceFileMetadata(fs, path) : cacheEntry.metadata;
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
        diagnostics.warning({
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
  diagnostics.record("cacheScanHits", cacheScanHits);
  diagnostics.record("cacheScanMisses", cacheScanMisses);
  diagnostics.record("cachedResolvedEdgeFiles", cachedResolvedEdgeFiles);
  diagnostics.record("graphNodes", graphNodes.length);
  const stagedEntries = cacheStore.entries();

  const graph = await diagnostics.time("impact.graph.build", async () => {
    return await buildGraph(graphNodes, {
      resolveContext: {
        fs,
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
    diagnostics.warning(warning);
  }
  diagnostics.record("graphEdges", graph.edges.length);

  if (cachePath !== undefined && cacheNeedsRefresh) {
    await diagnostics.time("impact.cache.save", async () => {
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
        await saveCache(fs, cachePath, nextCache);
      } catch {
        // Ignore cache write failure. Impact result must still complete.
      }
    });
  }

  const impact = await diagnostics.time("impact.traverse", async () => {
    return await traverseImpact(graph, changedFiles);
  });
  diagnostics.record("changedFiles", changedFiles.length);
  diagnostics.record("affectedModules", impact.affectedModules.length);
  const testMap = await diagnostics.time("impact.testMap.load", async () => {
    return await loadTestMap(fs, normalizePath(join(cwd, config.tests?.manifest ?? ".sniffler/test-map.json")));
  });
  const recommendedTests = await diagnostics.time("impact.tests.match", async () => {
    return matchTests({ testMap, impact });
  });
  diagnostics.record("recommendedTests", recommendedTests.length);
  diagnostics.record("warnings", warnings.length);
  return {
    changedFiles: sortUniqueStrings(changedFiles),
    affectedModules: sortUniqueStrings(impact.affectedModules),
    recommendedTests,
    warnings: sortUniqueStrings(warnings)
  };
};

export const runImpactCommand = async (
  input: ImpactCommandInput,
  deps: ImpactCommandDeps
): Promise<ImpactCommandResult> => {
  const output = await selectImpact(input, deps);
  const fs = getFs(deps);
  const config = (await loadConfig({ fs, configPath: input.configPath })).config;
  const format = input.format ?? config.output?.format ?? "text";
  const rendered = await (deps.diagnostics ?? noopDiagnostics).time("impact.output.render", async () => {
    return format === "json" ? renderJsonOutput(output) : renderTextOutput(output);
  });

  return {
    exitCode: 0,
    output: rendered,
    impact: output
  };
};
