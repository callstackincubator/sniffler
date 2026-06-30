import type { ImpactOutput } from "./output-types.js";
import { compareTestMatchReasons } from "../test-map/match-tests.js";

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const formatPath = (path: ReadonlyArray<string>): string => {
  return path.join(" -> ");
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

      const reasons = [...test.reasons].sort(compareTestMatchReasons);

      for (const reason of reasons) {
        if (reason.kind === "run-all") {
          lines.push(`    run all: ${reason.declaredTarget}`);
          lines.push(`    changed: ${reason.changedFile}`);
          continue;
        }

        if (reason.kind === "containment") {
          lines.push(`    containment target: ${reason.declaredTarget}`);
          lines.push(`    changed: ${reason.changedFile}`);
          lines.push(`    invalidated root: ${reason.invalidatedRoot}`);
          lines.push(`    reverse path: ${formatPath(reason.dependencyPath)}`);
          lines.push(`    containment path: ${formatPath(reason.containmentPath)}`);
          continue;
        }

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
