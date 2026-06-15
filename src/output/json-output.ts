import type { ImpactOutput } from "./output-types.js";

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const formatPath = (path: ReadonlyArray<string>): string => {
  return path.join("\u0000");
};

const compareReasons = (
  left: ImpactOutput["recommendedTests"][number]["reasons"][number],
  right: ImpactOutput["recommendedTests"][number]["reasons"][number]
): number => {
  const pathLengthComparison = left.dependencyPath.length - right.dependencyPath.length;
  if (pathLengthComparison !== 0) {
    return pathLengthComparison;
  }

  const leftIsGlob = /[*?]/.test(left.declaredTarget);
  const rightIsGlob = /[*?]/.test(right.declaredTarget);

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

  return formatPath(left.dependencyPath).localeCompare(formatPath(right.dependencyPath));
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
          .sort(compareReasons)
          .map((reason) => ({
            changedFile: reason.changedFile,
            declaredTarget: reason.declaredTarget,
            dependencyPath: [...reason.dependencyPath]
          }))
      })),
    warnings: sortUniqueStrings(output.warnings)
  };

  return JSON.stringify(payload, null, 2);
};
