import type { ResolvedEdge } from "../cache/cache-types.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { normalizePath } from "../filesystem/path-utils.js";
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
};

export type DependencyGraph = {
  nodes: ReadonlyArray<GraphNode>;
  edges: ReadonlyArray<ResolvedEdge>;
};

export type BuildGraphInput = {
  resolveContext?: ResolveContext;
};

export const buildGraph = async (
  nodes: ReadonlyArray<GraphNode>,
  input: BuildGraphInput = {}
): Promise<DependencyGraph> => {
  const fallbackFileSystem: FileSystem = {
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
  const resolveContext = input.resolveContext ?? { fs: fallbackFileSystem };
  const resolutionCache = new Map<string, Awaited<ReturnType<typeof resolveImport>>>();
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
    workspacePackagesByName,
    tsconfigPathsIndex,
    resolutionCache
  };

  const normalizedNodes = new Map<string, GraphNode>();
  const edges: ResolvedEdge[] = [];

  for (const node of nodes) {
    const path = normalizePath(node.path);
    normalizedNodes.set(path, {
      path,
      scan: node.scan
    });
  }

  for (const node of normalizedNodes.values()) {
    for (const dependency of node.scan.imports) {
      const result = await resolveImport(
        dependency.specifier,
        node.path,
        {
          ...baseResolveContext,
          importKind: dependency.kind === "require" ? "require" : "import"
        },
        [
          relativeResolver,
          tsconfigPathsResolver,
          packageExportsResolver,
          workspacePackageResolver
        ]
      );

      if (result.type !== "resolved") {
        continue;
      }

      edges.push({
        from: node.path,
        to: result.path,
        resolver: result.resolver,
        entities: dependency.entities,
        reExports: null
      });
    }

    for (const exported of node.scan.exports) {
      if (exported.kind === "local") {
        continue;
      }

      const result = await resolveImport(
        exported.specifier,
        node.path,
        {
          ...baseResolveContext,
          importKind: "import"
        },
        [
          relativeResolver,
          tsconfigPathsResolver,
          packageExportsResolver,
          workspacePackageResolver
        ]
      );

      if (result.type !== "resolved") {
        continue;
      }

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
    }
  }

  const sortedEdges = edges
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

  return {
    nodes: Array.from(normalizedNodes.values()).sort((left, right) => left.path.localeCompare(right.path)),
    edges: sortedEdges
  };
};
