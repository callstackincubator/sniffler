import { normalizePath } from "../filesystem/path-utils.js";
import type { DependencyGraph } from "./build-graph.js";
import type { ResolvedEdge } from "../cache/cache-types.js";
import { edgeParticipatesInContainment } from "./edge-semantics.js";

export type ContainmentPathEdge = {
  from: string;
  to: string;
  synthetic?: ResolvedEdge["synthetic"];
};

export type ContainmentPath = {
  module: string;
  invalidatedRoot: string;
  path: ReadonlyArray<string>;
  containmentPathEdges?: ReadonlyArray<ContainmentPathEdge>;
};

export type ContainmentResult = {
  affectedModules: ReadonlyArray<string>;
  paths: ReadonlyArray<ContainmentPath>;
};

type ForwardEdge = {
  to: string;
  edge: ResolvedEdge;
};

type QueueEntry = {
  module: string;
  path: ReadonlyArray<string>;
  root: string;
  edges: ReadonlyArray<ContainmentPathEdge>;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const compareForwardEdges = (left: ForwardEdge, right: ForwardEdge): number => {
  const toComparison = left.to.localeCompare(right.to);
  if (toComparison !== 0) {
    return toComparison;
  }

  return JSON.stringify(left.edge).localeCompare(JSON.stringify(right.edge));
};

export const traverseContainment = async (
  graph: DependencyGraph,
  invalidatedRoots: ReadonlyArray<string>
): Promise<ContainmentResult> => {
  const adjacency = new Map<string, Array<ForwardEdge>>();
  const bestPaths = new Map<string, ContainmentPath>();

  for (const edge of graph.edges) {
    if (!edgeParticipatesInContainment(edge)) {
      continue;
    }

    const from = normalizePath(edge.from);
    const to = normalizePath(edge.to);
    const bucket = adjacency.get(from);

    if (bucket === undefined) {
      adjacency.set(from, [{ to, edge }]);
      continue;
    }

    bucket.push({ to, edge });
  }

  for (const bucket of adjacency.values()) {
    bucket.sort(compareForwardEdges);
  }

  const setBestPath = (entry: QueueEntry): boolean => {
    const current = bestPaths.get(entry.module);

    if (current === undefined) {
      bestPaths.set(entry.module, {
        module: entry.module,
        invalidatedRoot: entry.root,
        path: entry.path,
        containmentPathEdges: entry.edges
      });
      return true;
    }

    if (entry.path.length < current.path.length) {
      bestPaths.set(entry.module, {
        module: entry.module,
        invalidatedRoot: entry.root,
        path: entry.path,
        containmentPathEdges: entry.edges
      });
      return true;
    }

    if (entry.path.length > current.path.length) {
      return false;
    }

    const currentKey = current.path.join("\u0000");
    const nextKey = entry.path.join("\u0000");

    if (nextKey < currentKey) {
      bestPaths.set(entry.module, {
        module: entry.module,
        invalidatedRoot: entry.root,
        path: entry.path,
        containmentPathEdges: entry.edges
      });
      return true;
    }

    return false;
  };

  let frontier: Array<QueueEntry> = sortUniqueStrings(invalidatedRoots.map((path) => normalizePath(path))).map((root) => ({
      module: root,
      path: [root],
      root,
      edges: []
    }));

  while (frontier.length > 0) {
    frontier.sort((left, right) => {
      const pathLengthComparison = left.path.length - right.path.length;
      if (pathLengthComparison !== 0) {
        return pathLengthComparison;
      }

      const pathComparison = left.path.join("\u0000").localeCompare(right.path.join("\u0000"));
      if (pathComparison !== 0) {
        return pathComparison;
      }

      const moduleComparison = left.module.localeCompare(right.module);
      if (moduleComparison !== 0) {
        return moduleComparison;
      }

      return left.root.localeCompare(right.root);
    });

    const nextFrontier: Array<QueueEntry> = [];

    for (const current of frontier) {
      if (!setBestPath(current)) {
        continue;
      }

      const nextEdges = adjacency.get(current.module) ?? [];

      for (const edge of nextEdges) {
        nextFrontier.push({
          module: edge.to,
          path: [...current.path, edge.to],
          root: current.root,
          edges: [
            ...current.edges,
            {
              from: current.module,
              to: edge.to,
              ...(edge.edge.synthetic === undefined ? {} : { synthetic: edge.edge.synthetic })
            }
          ]
        });
      }
    }

    frontier = nextFrontier;
  }

  const paths = [...bestPaths.values()];

  return {
    affectedModules: sortUniqueStrings(paths.map((path) => path.module)),
    paths
  };
};
