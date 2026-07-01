import type { ResolvedEdge } from "../cache/cache-types.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { createGlobMatcher, normalizePath } from "../filesystem/path-utils.js";
import { noopDiagnostics, type Diagnostics } from "../diagnostics/diagnostics.js";
import type { SnifflerGraphConfig } from "../config/config-schema.js";
import { relativeResolver } from "../resolvers/relative-resolver.js";
import {
  compileTsconfigPathsConfig,
  resolveImport,
  type ResolveContext
} from "../resolvers/resolve-import.js";
import { tsconfigPathsResolver } from "../resolvers/tsconfig-paths-resolver.js";
import { workspacePackageResolver } from "../resolvers/workspace-package-resolver.js";
import { packageExportsResolver } from "../resolvers/package-exports-resolver.js";
import { ALL_ENTITY_SELECTION } from "../scanner/scanner-types.js";
import type { RawExport, ScanResult } from "../scanner/scanner-types.js";
import type { WorkspacePackage } from "../workspaces/discover-workspaces.js";

export type GraphNode = {
  path: string;
  scan: ScanResult;
  resolvedEdges?: ReadonlyArray<ResolvedEdge>;
};

export type GraphWarning = {
  source: "resolver";
  kind: "import" | "export";
  resolver: string;
  file: string;
  specifier: string;
  importKind: "import" | "require";
  message: string;
};

export type DependencyGraph = {
  nodes: ReadonlyArray<GraphNode>;
  edges: ReadonlyArray<ResolvedEdge>;
  warnings: ReadonlyArray<GraphWarning>;
};

export type BuildGraphInput = {
  diagnostics?: Diagnostics;
  graph?: SnifflerGraphConfig;
  resolveContext?: ResolveContext;
};

const resolvers = [
  relativeResolver,
  tsconfigPathsResolver,
  packageExportsResolver,
  workspacePackageResolver
] as const;

const isGlobTarget = (target: string): boolean => {
  return /[*?]/.test(target);
};

const getSyntheticContainmentEdgeKey = (edge: ResolvedEdge): string => {
  return JSON.stringify({
    from: edge.from,
    to: edge.to,
    resolver: edge.resolver,
    entities: edge.entities,
    reExports: edge.reExports,
    synthetic: edge.synthetic ?? null
  });
};

const expandSyntheticContainmentEdges = (
  graphVisiblePaths: ReadonlyArray<string>,
  graphConfig: SnifflerGraphConfig | undefined,
  existingEdges: ReadonlyArray<ResolvedEdge>
): Array<ResolvedEdge> => {
  const rules = graphConfig?.contains ?? [];

  if (rules.length === 0 || graphVisiblePaths.length === 0) {
    return [];
  }

  const visibleSet = new Set(graphVisiblePaths.map((path) => normalizePath(path)));
  const syntheticEdges: ResolvedEdge[] = [];
  const syntheticEdgeKeys = new Set(existingEdges.map((edge) => getSyntheticContainmentEdgeKey(edge)));

  const matchPaths = (pattern: string): Array<string> => {
    const normalizedPattern = normalizePath(pattern);

    if (!isGlobTarget(pattern)) {
      return visibleSet.has(normalizedPattern) ? [normalizedPattern] : [];
    }

    const matcher = createGlobMatcher(pattern);
    return [...visibleSet].filter((path) => matcher(path)).sort((left, right) => left.localeCompare(right));
  };

  for (const rule of rules) {
    const fromPaths = matchPaths(rule.from);
    const toPaths = matchPaths(rule.to);

    for (const from of fromPaths) {
      for (const to of toPaths) {
        if (from === to) {
          continue;
        }

        const edge: ResolvedEdge = {
          from,
          to,
          resolver: "synthetic:containment",
          entities: ALL_ENTITY_SELECTION,
          reExports: null,
          synthetic: {
            kind: "containment",
            from,
            to
          }
        };
        const key = getSyntheticContainmentEdgeKey(edge);

        if (syntheticEdgeKeys.has(key)) {
          continue;
        }

        syntheticEdgeKeys.add(key);
        syntheticEdges.push(edge);
      }
    }
  }

  return syntheticEdges;
};

export const buildGraph = async (
  nodes: ReadonlyArray<GraphNode>,
  input: BuildGraphInput = {}
): Promise<DependencyGraph> => {
  const fallbackFileSystem: FileSystem = {
    supportsWorkerScanning: false,
    readFile: async (path: string) => {
      throw new Error(`File not found: ${path}`);
    },
    readJson: async <T>(path: string) => {
      throw new Error(`File not found: ${path}`);
    },
    exists: async () => false,
    glob: async () => [],
    stat: async (path: string) => {
      throw new Error(`Path not found: ${path}`);
    },
    writeFile: async () => undefined,
    rename: async () => undefined
  };
  const resolveContext: ResolveContext = input.resolveContext ?? { fs: fallbackFileSystem };
  const diagnostics = input.diagnostics ?? resolveContext.diagnostics ?? noopDiagnostics;
  const resolutionCache = new Map<string, Awaited<ReturnType<typeof resolveImport>>>();
  const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
  const tsconfigPathsResolutionCache = new Map<string, Promise<Awaited<ReturnType<typeof resolveImport>>>>();
  const workspacePackagesByName = new Map<string, WorkspacePackage>(
    (resolveContext.workspacePackages ?? []).map((workspacePackage) => [
      workspacePackage.name,
      workspacePackage
    ])
  );
  const tsconfigPathsIndex =
    resolveContext.tsconfigPaths === undefined
      ? undefined
      : compileTsconfigPathsConfig(resolveContext.tsconfigPaths);
  const baseResolveContext: ResolveContext = {
    ...resolveContext,
    diagnostics,
    workspacePackagesByName,
    tsconfigPathsIndex,
    resolutionCache,
    sourceCandidateCache,
    tsconfigPathsResolutionCache
  };
  const createResolveContext = (kind: GraphWarning["kind"]): ResolveContext => {
    return {
      ...baseResolveContext,
      onWarning: ({ resolver, warning, specifier, fromFile, importKind }) => {
        warnings.push({
          source: "resolver",
          kind,
          resolver,
          file: fromFile,
          specifier,
          importKind,
          message: warning
        });
      }
    };
  };

  const normalizedNodes = new Map<string, GraphNode>();
  const edges: ResolvedEdge[] = [];
  const warnings: GraphWarning[] = [];
  const normalizedNodesList = await diagnostics.time("impact.graph.nodes.normalize", async () => {
    for (const node of nodes) {
      const path = normalizePath(node.path);
      normalizedNodes.set(path, {
        path,
        scan: node.scan,
        resolvedEdges: node.resolvedEdges?.map((edge) => ({
          ...edge,
          from: path,
          to: normalizePath(edge.to),
          ...(edge.synthetic === undefined
            ? {}
            : {
                synthetic: {
                  kind: "containment",
                  from: normalizePath(edge.synthetic.from),
                  to: normalizePath(edge.synthetic.to)
                }
              })
        }))
      });
    }

    return Array.from(normalizedNodes.values());
  });

  const nodesToResolve: GraphNode[] = [];
  let graphResolvedEdgesFromCache = 0;

  for (const node of normalizedNodesList) {
    if (node.resolvedEdges !== undefined) {
      edges.push(...node.resolvedEdges);
      graphResolvedEdgesFromCache += 1;
      continue;
    }

    nodesToResolve.push(node);
  }

  diagnostics.record("graphResolvedEdgesFromCache", graphResolvedEdgesFromCache);

  let graphImportSpecifiers = 0;
  let graphExportSpecifiers = 0;
  let graphImportResolved = 0;
  let graphImportExternal = 0;
  let graphImportUnresolved = 0;
  let graphExportResolved = 0;
  let graphExportExternal = 0;
  let graphExportUnresolved = 0;
  let graphResolvedEdgesCreated = 0;

  await diagnostics.time("impact.graph.resolve.imports", async () => {
    for (const node of nodesToResolve) {
      for (const dependency of node.scan.imports) {
        graphImportSpecifiers += 1;

        const result = await resolveImport(
          dependency.specifier,
          node.path,
          {
            ...createResolveContext("import"),
            importKind: dependency.kind === "require" ? "require" : "import"
          },
          resolvers
        );

        if (result.type === "resolved") {
          graphImportResolved += 1;
          graphResolvedEdgesCreated += 1;
          edges.push({
            from: node.path,
            to: result.path,
            resolver: result.resolver,
            entities: dependency.entities,
            reExports: null
          });
          continue;
        }

        if (result.type === "external") {
          graphImportExternal += 1;
          continue;
        }

        graphImportUnresolved += 1;
      }
    }
  });

  await diagnostics.time("impact.graph.resolve.exports", async () => {
    for (const node of nodesToResolve) {
      for (const exported of node.scan.exports) {
        if (exported.kind === "local") {
          continue;
        }

        graphExportSpecifiers += 1;

        const result = await resolveImport(
          exported.specifier,
          node.path,
          {
            ...createResolveContext("export"),
            importKind: "import"
          },
          resolvers
        );

        if (result.type === "resolved") {
          graphExportResolved += 1;
          graphResolvedEdgesCreated += 1;
          if (exported.kind === "re-export") {
            edges.push({
              from: node.path,
              to: result.path,
              resolver: result.resolver,
              entities: {
                type: "named",
                entities: [
                  {
                    imported: exported.imported,
                    local: exported.exported === exported.imported ? undefined : exported.exported
                  }
                ]
              },
              reExports: [
                {
                  imported: exported.imported,
                  exported: exported.exported
                }
              ]
            });
            continue;
          }

          edges.push({
            from: node.path,
            to: result.path,
            resolver: result.resolver,
            entities: ALL_ENTITY_SELECTION,
            reExports: ALL_ENTITY_SELECTION
          });
          continue;
        }

        if (result.type === "external") {
          graphExportExternal += 1;
          continue;
        }

        graphExportUnresolved += 1;
      }
    }
  });

  diagnostics.record("graphImportSpecifiers", graphImportSpecifiers);
  diagnostics.record("graphExportSpecifiers", graphExportSpecifiers);
  diagnostics.record("graphImportResolved", graphImportResolved);
  diagnostics.record("graphImportExternal", graphImportExternal);
  diagnostics.record("graphImportUnresolved", graphImportUnresolved);
  diagnostics.record("graphExportResolved", graphExportResolved);
  diagnostics.record("graphExportExternal", graphExportExternal);
  diagnostics.record("graphExportUnresolved", graphExportUnresolved);
  diagnostics.record("graphResolvedEdgesCreated", graphResolvedEdgesCreated);

  const syntheticContainmentEdges = expandSyntheticContainmentEdges(
    Array.from(normalizedNodes.keys()),
    input.graph,
    edges
  );

  if (syntheticContainmentEdges.length > 0) {
    edges.push(...syntheticContainmentEdges);
    diagnostics.record("graphResolvedEdgesCreated", graphResolvedEdgesCreated + syntheticContainmentEdges.length);
  }

  diagnostics.record("graphEdgesSorted", edges.length);

  const sortedEdges = await diagnostics.time("impact.graph.edges.sort", async () => {
    return edges
      .map((edge) => ({
        edge,
        entityKey: JSON.stringify(edge.entities),
        reExportKey: JSON.stringify(edge.reExports)
      }))
      .sort((left, right) => {
        const fromComparison = left.edge.from.localeCompare(right.edge.from);
        if (fromComparison !== 0) {
          return fromComparison;
        }

        const toComparison = left.edge.to.localeCompare(right.edge.to);
        if (toComparison !== 0) {
          return toComparison;
        }

        const resolverComparison = left.edge.resolver.localeCompare(right.edge.resolver);
        if (resolverComparison !== 0) {
          return resolverComparison;
        }

        const entityComparison = left.entityKey.localeCompare(right.entityKey);
        if (entityComparison !== 0) {
          return entityComparison;
        }

        return left.reExportKey.localeCompare(right.reExportKey);
      })
      .map(({ edge }) => edge);
  });

  return {
    nodes: normalizedNodesList.sort((left, right) => left.path.localeCompare(right.path)),
    edges: sortedEdges,
    warnings
  };
};
