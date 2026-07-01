import { normalizePath, createGlobMatcher } from "../filesystem/path-utils.js";
import { traverseContainment } from "../graph/traverse-containment.js";
import { traverseImpact } from "../graph/traverse-impact.js";
import type { Diagnostics } from "../diagnostics/diagnostics.js";
import type { DependencyGraph } from "../graph/build-graph.js";
import type { ImpactOutput } from "../output/output-types.js";
import { loadTestMap, type TestMap } from "../test-map/load-test-map.js";
import { matchTests } from "../test-map/match-tests.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import type { SnifflerConfig } from "../config/config-schema.js";

export type ImpactSelectionResult = {
  affectedModules: Array<string>;
  recommendedTests: ImpactOutput["recommendedTests"];
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const mergeDependsOn = (dependsOn: ReadonlyArray<string>, sharedTargets: ReadonlyArray<string>): Array<string> => {
  const mergedTargets = new Map<string, string>();

  for (const target of [...dependsOn, ...sharedTargets]) {
    const normalizedTarget = normalizePath(target);

    if (!mergedTargets.has(normalizedTarget)) {
      mergedTargets.set(normalizedTarget, target);
    }
  }

  return [...mergedTargets.values()];
};

const matchesPathPattern = (path: string, pattern: string): boolean => {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  if (/[*?]/.test(pattern)) {
    return createGlobMatcher(pattern)(normalizedPath);
  }

  return normalizedPath === normalizedPattern;
};

const selectInvalidatedRoots = (
  config: SnifflerConfig,
  impactAffectedModules: ReadonlyArray<string>
): Array<string> => {
  const invalidateSubtreeWhenTouched = config.tests?.invalidateSubtreeWhenTouched ?? [];

  if (invalidateSubtreeWhenTouched.length === 0) {
    return [];
  }

  return sortUniqueStrings(
    impactAffectedModules.filter((module) => {
      return invalidateSubtreeWhenTouched.some((pattern) => matchesPathPattern(module, pattern));
    })
  );
};

const selectExpandedTestMap = (testMap: TestMap, sharedTargets: ReadonlyArray<string>): TestMap => {
  if (sharedTargets.length === 0) {
    return testMap;
  }

  return testMap.map((entry) => ({
    test: entry.test,
    dependsOn: mergeDependsOn(entry.dependsOn, sharedTargets)
  }));
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
  const invalidatedRoots = selectInvalidatedRoots(input.config, impact.affectedModules);
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
  const sharedTargets = input.config.tests?.sharedTargets ?? [];
  const expandedTestMap = selectExpandedTestMap(testMap, sharedTargets);
  const recommendedTests = await input.diagnostics.time("impact.tests.match", async () => {
    return matchTests({ testMap: expandedTestMap, impact, containment });
  });

  return {
    affectedModules,
    recommendedTests
  };
};
