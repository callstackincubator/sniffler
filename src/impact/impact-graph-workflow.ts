import { dirname, join } from "node:path";
import type { GraphCache } from "../cache/cache-types.js";
import type { GraphCacheStore } from "../cache/cache-store.js";
import type { StaleChecker } from "../cache/stale-checker.js";
import type { SnifflerConfig } from "../config/config-schema.js";
import { normalizePath } from "../filesystem/path-utils.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { buildGraph, type DependencyGraph } from "../graph/build-graph.js";
import { discoverWorkspaces } from "../workspaces/discover-workspaces.js";
import { packageJsonWorkspacesStrategy } from "../workspaces/package-json-workspaces.js";
import { pnpmWorkspaceStrategy } from "../workspaces/pnpm-workspace-yaml.js";
import type { TsconfigPathsConfig } from "../resolvers/resolve-import.js";
import type { Diagnostics } from "../diagnostics/diagnostics.js";
import { prepareImpactCacheState, saveImpactCache } from "./impact-cache-lifecycle.js";

export type ImpactGraphWorkflowResult = {
  graph: DependencyGraph;
  warnings: ReadonlyArray<string>;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
  const workspacePackages = await input.diagnostics.time("impact.workspaces.discover", async () => {
    return await discoverWorkspaces(input.cwd, input.fs, buildWorkspaceStrategies(config));
  });
  const tsconfigPaths = await input.diagnostics.time("impact.tsconfig.load", async () => {
    return await loadTsconfigPaths(input.fs, input.cwd, config);
  });
  const sourceFiles = await input.diagnostics.time("impact.sources.discover", async () => {
    return await discoverSourceFiles(input.fs, input.cwd, config);
  });
  const state = await prepareImpactCacheState({
    fs: input.fs,
    cwd: input.cwd,
    config: input.config,
    diagnostics: input.diagnostics,
    staleChecker: input.staleChecker,
    cacheStoreFactory: input.cacheStoreFactory,
    platform: input.platform,
    sourceFiles
  });

  const graph = await input.diagnostics.time("impact.graph.build", async () => {
    return await buildGraph([...state.graphNodes], {
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
    input.diagnostics.warning(warning);
  }
  input.diagnostics.record("graphEdges", graph.edges.length);

  await saveImpactCache({
    fs: input.fs,
    diagnostics: input.diagnostics,
    state,
    graph
  });

  return {
    graph,
    warnings: [...state.warnings, ...graph.warnings.map((warning) => warning.message)]
  };
};
