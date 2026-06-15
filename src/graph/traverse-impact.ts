import { normalizePath } from "../filesystem/path-utils.js";
import type { DependencyGraph } from "./build-graph.js";

export type ImpactPath = {
  module: string;
  path: ReadonlyArray<string>;
};

export type ImpactResult = {
  affectedModules: ReadonlyArray<string>;
  paths: ReadonlyArray<ImpactPath>;
};

export const traverseImpact = async (
  graph: DependencyGraph,
  changedFiles: ReadonlyArray<string>
): Promise<ImpactResult> => {
  const reverseEdges = new Map<string, Array<string>>();

  for (const edge of graph.edges) {
    const importer = normalizePath(edge.from);
    const imported = normalizePath(edge.to);
    const bucket = reverseEdges.get(imported);

    if (bucket === undefined) {
      reverseEdges.set(imported, [importer]);
      continue;
    }

    if (!bucket.includes(importer)) {
      bucket.push(importer);
    }
  }

  for (const importers of reverseEdges.values()) {
    importers.sort((left, right) => left.localeCompare(right));
  }

  const queue: Array<string> = [];
  const paths = new Map<string, Array<string>>();
  const visited = new Set<string>();

  const startingModules = Array.from(new Set(changedFiles.map((file) => normalizePath(file)))).sort((left, right) =>
    left.localeCompare(right)
  );

  for (const changedFile of startingModules) {
    visited.add(changedFile);
    queue.push(changedFile);
    paths.set(changedFile, [changedFile]);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentPath = paths.get(current);

    if (currentPath === undefined) {
      continue;
    }

    const importers = reverseEdges.get(current) ?? [];

    for (const importer of importers) {
      if (visited.has(importer)) {
        continue;
      }

      visited.add(importer);
      queue.push(importer);
      paths.set(importer, [...currentPath, importer]);
    }
  }

  return {
    affectedModules: queue,
    paths: queue.map((module) => ({
      module,
      path: paths.get(module) ?? [module]
    }))
  };
};
