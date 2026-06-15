import type { MatchedTest } from "../test-map/match-tests.js";

export type ImpactOutput = {
  changedFiles: ReadonlyArray<string>;
  affectedModules: ReadonlyArray<string>;
  recommendedTests: ReadonlyArray<MatchedTest>;
  warnings: ReadonlyArray<string>;
};
