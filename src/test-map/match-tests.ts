import { createGlobMatcher, normalizePath } from "../filesystem/path-utils.js";
import type { ImpactResult } from "../graph/traverse-impact.js";
import type { TestMap } from "./load-test-map.js";

export type MatchedTest = {
  test: string;
  reasons: ReadonlyArray<TestMatchReason>;
};

export type TestMatchReason = {
  changedFile: string;
  declaredTarget: string;
  dependencyPath: ReadonlyArray<string>;
};

export type MatchTestsInput = {
  testMap: TestMap;
  impact: ImpactResult;
};

const isGlobTarget = (target: string): boolean => {
  return /[*?]/.test(target);
};

const compareReasons = (left: TestMatchReason, right: TestMatchReason): number => {
  const pathLengthComparison = left.dependencyPath.length - right.dependencyPath.length;
  if (pathLengthComparison !== 0) {
    return pathLengthComparison;
  }

  const leftIsGlob = isGlobTarget(left.declaredTarget);
  const rightIsGlob = isGlobTarget(right.declaredTarget);

  if (leftIsGlob !== rightIsGlob) {
    return leftIsGlob ? 1 : -1;
  }

  const changedFileComparison = left.changedFile.localeCompare(right.changedFile);
  if (changedFileComparison !== 0) {
    return changedFileComparison;
  }

  const targetComparison = left.declaredTarget.localeCompare(right.declaredTarget);
  if (targetComparison !== 0) {
    return targetComparison;
  }

  return left.dependencyPath.join("\u0000").localeCompare(right.dependencyPath.join("\u0000"));
};

export const matchTests = ({ testMap, impact }: MatchTestsInput): Array<MatchedTest> => {
  const pathsByModule = new Map<string, ReadonlyArray<string>>();

  for (const path of impact.paths) {
    pathsByModule.set(normalizePath(path.module), path.path);
  }

  const matchedTests: MatchedTest[] = [];
  const sortedTests = [...testMap.tests].sort((left, right) => left.test.localeCompare(right.test));

  for (const testEntry of sortedTests) {
    const reasons: TestMatchReason[] = [];
    const seenReasons = new Set<string>();

    for (const target of testEntry.targets) {
      const normalizedTarget = normalizePath(target);
      const matcher = isGlobTarget(target) ? createGlobMatcher(target) : null;

      for (const [module, dependencyPath] of pathsByModule) {
        const matched = matcher === null ? module === normalizedTarget : matcher(module);

        if (!matched) {
          continue;
        }

        const changedFile = dependencyPath[0] ?? module;
        const reason: TestMatchReason = {
          changedFile,
          declaredTarget: target,
          dependencyPath
        };
        const reasonKey = [
          reason.changedFile,
          reason.declaredTarget,
          ...reason.dependencyPath
        ].join("\u0000");

        if (seenReasons.has(reasonKey)) {
          continue;
        }

        seenReasons.add(reasonKey);
        reasons.push(reason);
      }
    }

    if (reasons.length === 0) {
      continue;
    }

    matchedTests.push({
      test: testEntry.test,
      reasons: [...reasons].sort(compareReasons)
    });
  }

  return matchedTests;
};
