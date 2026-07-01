import type { Diagnostics } from "../diagnostics/diagnostics.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import type { DependencyGraph } from "../graph/build-graph.js";
import { traverseContainment } from "../graph/traverse-containment.js";
import { traverseImpact } from "../graph/traverse-impact.js";
import { loadTestMap } from "../test-map/load-test-map.js";
import {
  recommendTests,
  selectInvalidatedRoots,
  type MatchedTest
} from "../test-map/recommend-tests.js";
import type { SnifflerConfig } from "../config/config-schema.js";

export type ImpactSelectionResult = {
  affectedModules: Array<string>;
  recommendedTests: ReadonlyArray<MatchedTest>;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

export const selectImpactTests = async (input: {
  fs: FileSystem;
  config: SnifflerConfig;
  testMapPath: string;
  graph: DependencyGraph;
  changedFiles: ReadonlyArray<string>;
  diagnostics: Diagnostics;
}): Promise<ImpactSelectionResult> => {
  const impact = await input.diagnostics.time("impact.traverse", async () => {
    return await traverseImpact(input.graph, input.changedFiles);
  });
  const invalidateSubtreeWhenTouched = input.config.tests?.invalidateSubtreeWhenTouched ?? [];
  const sharedTargets = input.config.tests?.sharedTargets ?? [];
  const invalidatedRoots = selectInvalidatedRoots(invalidateSubtreeWhenTouched, impact.affectedModules);
  const containment =
    invalidatedRoots.length === 0
      ? undefined
      : await input.diagnostics.time("impact.containment.traverse", async () => {
          return await traverseContainment(input.graph, invalidatedRoots);
        });
  const affectedModules = sortUniqueStrings([
    ...impact.affectedModules,
    ...(containment?.affectedModules ?? [])
  ]);
  const testMap = await input.diagnostics.time("impact.testMap.load", async () => {
    return await loadTestMap(input.fs, input.testMapPath);
  });
  const recommendedTests = await input.diagnostics.time("impact.tests.match", async () => {
    return recommendTests({
      testMap,
      impact,
      containment,
      sharedTargets
    });
  });

  return {
    affectedModules,
    recommendedTests
  };
};
