import type { ResolvedEdge } from "../cache/cache-types.js";
import { normalizePath } from "../filesystem/path-utils.js";
import { resolveRelativePath } from "../resolvers/relative-resolver.js";
import type { ScanResult } from "../scanner/scanner-types.js";

export type GraphNode = {
  path: string;
  scan: ScanResult;
};

export type DependencyGraph = {
  nodes: ReadonlyArray<GraphNode>;
  edges: ReadonlyArray<ResolvedEdge>;
};

export const buildGraph = async (nodes: ReadonlyArray<GraphNode>): Promise<DependencyGraph> => {
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
      if (!dependency.specifier.startsWith("./") && !dependency.specifier.startsWith("../")) {
        continue;
      }

      edges.push({
        from: node.path,
        to: resolveRelativePath(dependency.specifier, node.path),
        resolver: "relative"
      });
    }
  }

  return {
    nodes: Array.from(normalizedNodes.values()).sort((left, right) => left.path.localeCompare(right.path)),
    edges: edges.sort((left, right) => {
      const fromComparison = left.from.localeCompare(right.from);
      if (fromComparison !== 0) {
        return fromComparison;
      }

      const toComparison = left.to.localeCompare(right.to);
      if (toComparison !== 0) {
        return toComparison;
      }

      return left.resolver.localeCompare(right.resolver);
    })
  };
};
