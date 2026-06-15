import type { DependencyGraph } from "./build-graph.js";

export type ImpactResult = {
  affectedModules: ReadonlyArray<string>;
};

export const traverseImpact = async (
  _graph: DependencyGraph,
  changedFiles: ReadonlyArray<string>
): Promise<ImpactResult> => {
  return {
    affectedModules: [...changedFiles]
  };
};
