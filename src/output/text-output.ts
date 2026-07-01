import type { ImpactOutput } from "./output-types.js";
import { compareTestMatchReasons } from "../test-map/recommend-tests.js";

export type TextOutputOptions = {
  diagnosticsPath?: string;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const colors = {
  green: (value: string) => `\u001b[32m${value}\u001b[39m`,
  yellow: (value: string) => `\u001b[33m${value}\u001b[39m`,
  cyan: (value: string) => `\u001b[36m${value}\u001b[39m`,
  dim: (value: string) => `\u001b[2m${value}\u001b[22m`
};

const pluralize = (count: number, singular: string, plural = `${singular}s`): string => {
  return count === 1 ? singular : plural;
};

const formatCount = (count: number, singular: string, plural?: string): string => {
  return `${count} ${pluralize(count, singular, plural)}`;
};

const padLabel = (label: string): string => {
  return label.padStart(11);
};

const formatSummaryLine = (label: string, value: string): string => {
  return `${colors.dim(padLabel(label))} ${value}`;
};

const formatReason = (reason: ImpactOutput["recommendedTests"][number]["reasons"][number]): string => {
  if (reason.kind === "run-all") {
    return `runs because ${colors.cyan(reason.changedFile)} matches ${colors.cyan(reason.declaredTarget)}`;
  }

  return `depends on affected ${colors.cyan(reason.declaredTarget)}`;
};

const formatWarningSummary = (warningCount: number, diagnosticsPath?: string): Array<string> => {
  if (warningCount === 0) {
    return [];
  }

  if (diagnosticsPath !== undefined) {
    return [formatSummaryLine("Diagnostics", colors.cyan(diagnosticsPath))];
  }

  return [` ${colors.yellow("Run with --diagnostics")} ${colors.dim("to inspect warning details.")}`];
};

export const renderTextOutput = (output: ImpactOutput, options: TextOutputOptions = {}): string => {
  const lines: string[] = [];
  const changedFiles = sortUniqueStrings(output.changedFiles);
  const affectedModules = sortUniqueStrings(output.affectedModules);
  const recommendedTests = [...output.recommendedTests].sort((left, right) => left.test.localeCompare(right.test));
  const warnings = sortUniqueStrings(output.warnings);

  if (recommendedTests.length === 0) {
    lines.push(` ${colors.yellow("○")} ${colors.dim("No E2E tests selected")}`);
  } else {
    for (const test of recommendedTests) {
      lines.push(` ${colors.green("✓")} ${colors.cyan(test.test)}`);

      const reasons = [...test.reasons].sort(compareTestMatchReasons);
      const [firstReason, ...remainingReasons] = reasons;

      if (firstReason !== undefined) {
        lines.push(`   ${formatReason(firstReason)}`);
      }

      if (remainingReasons.length > 0) {
        lines.push(`   ${colors.dim(`+ ${formatCount(remainingReasons.length, "more reason")}`)}`);
      }
    }
  }

  lines.push("");
  lines.push(formatSummaryLine("Impact", formatCount(recommendedTests.length, "test selected", "tests selected")));
  lines.push(formatSummaryLine("Changed", formatCount(changedFiles.length, "file")));
  lines.push(formatSummaryLine("Affected", formatCount(affectedModules.length, "module")));
  lines.push(formatSummaryLine("Warnings", formatCount(warnings.length, "warning")));
  lines.push(...formatWarningSummary(warnings.length, options.diagnosticsPath));

  return `${lines.join("\n")}\n`;
};
