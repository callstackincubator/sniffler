import type { ImpactOutput } from "./output-types.js";

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const formatPath = (path: ReadonlyArray<string>): string => {
  return path.join(" -> ");
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

export const renderTextOutput = (output: ImpactOutput): string => {
  const lines: string[] = [];
  const changedFiles = sortUniqueStrings(output.changedFiles);
  const affectedModules = sortUniqueStrings(output.affectedModules);
  const recommendedTests = [...output.recommendedTests].sort((left, right) => left.test.localeCompare(right.test));
  const warnings = sortUniqueStrings(output.warnings);

  lines.push("Changed files:");

  if (changedFiles.length === 0) {
    lines.push("  none");
  } else {
    for (const changedFile of changedFiles) {
      lines.push(`  ${changedFile}`);
    }
  }

  lines.push("");
  lines.push("Affected modules:");

  if (affectedModules.length === 0) {
    lines.push("  none");
  } else {
    for (const affectedModule of affectedModules) {
      lines.push(`  ${affectedModule}`);
    }
  }

  lines.push("");
  lines.push("Recommended E2E tests:");

  if (recommendedTests.length === 0) {
    lines.push("  none");
  } else {
    for (const test of recommendedTests) {
      lines.push(`  ${test.test}`);

      const reasons = [...test.reasons].sort(compareReasons);

      for (const reason of reasons) {
        lines.push(`    target: ${reason.declaredTarget}`);
        lines.push(`    path: ${formatPath(reason.dependencyPath)}`);
      }
    }
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");

    for (const warning of warnings) {
      lines.push(`  ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
};
