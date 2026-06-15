import type { TestMap } from "./load-test-map.js";

export type MatchedTest = {
  test: string;
  reasons: ReadonlyArray<string>;
};

export const matchTests = (_testMap: TestMap, _affectedModules: ReadonlyArray<string>): Array<MatchedTest> => {
  return [];
};
