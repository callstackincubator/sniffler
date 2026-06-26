import type { ImpactOutput } from "./output-types.js";
import { compareTestMatchReasons } from "../test-map/match-tests.js";

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

export const renderJsonOutput = (output: ImpactOutput): string => {
  const payload = {
    changedFiles: sortUniqueStrings(output.changedFiles),
    affectedModules: sortUniqueStrings(output.affectedModules),
    recommendedTests: [...output.recommendedTests]
      .sort((left, right) => left.test.localeCompare(right.test))
      .map((test) => ({
        test: test.test,
        reasons: [...test.reasons]
          .sort(compareTestMatchReasons)
          .map((reason) => ({
            ...(reason.kind === "run-all" ? { kind: reason.kind } : {}),
            changedFile: reason.changedFile,
            declaredTarget: reason.declaredTarget,
            ...(reason.kind === "run-all" ? {} : { dependencyPath: [...reason.dependencyPath] })
          }))
      })),
    warnings: sortUniqueStrings(output.warnings)
  };

  return JSON.stringify(payload, null, 2);
};
