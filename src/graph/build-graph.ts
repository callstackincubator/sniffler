import type { ScanResult } from "../scanner/scanner-types.js";

export type GraphNode = {
  path: string;
  scan: ScanResult;
};

export type DependencyGraph = {
  nodes: ReadonlyArray<GraphNode>;
};

export const buildGraph = async (_nodes: ReadonlyArray<GraphNode>): Promise<DependencyGraph> => {
  return {
    nodes: []
  };
};
