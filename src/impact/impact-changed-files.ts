import { normalizePath, createGlobMatcher } from "../filesystem/path-utils.js";
import { loadTestMap, type TestMap } from "../test-map/load-test-map.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import type { ImpactCommandDeps, ImpactCommandInput } from "./impact-command.js";

export type RunAllReason = {
  kind: "run-all";
  changedFile: string;
  declaredTarget: string;
};

export type RunAllSelection = {
  reasons: ReadonlyArray<RunAllReason>;
  recommendedTests: ReadonlyArray<{
    test: string;
    reasons: ReadonlyArray<RunAllReason>;
  }>;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const isGlobTarget = (target: string): boolean => {
  return /[*?]/.test(target);
};

const matchesRunAllWhenChanged = (changedFile: string, declaredTarget: string): boolean => {
  const normalizedTarget = normalizePath(declaredTarget);

  if (isGlobTarget(declaredTarget)) {
    return createGlobMatcher(declaredTarget)(changedFile);
  }

  return normalizePath(changedFile) === normalizedTarget;
};

const createRunAllReasons = (
  changedFiles: ReadonlyArray<string>,
  runAllWhenChanged: ReadonlyArray<string>
): Array<RunAllReason> => {
  const reasons: Array<RunAllReason> = [];
  const seenReasons = new Set<string>();

  for (const changedFile of changedFiles) {
    for (const declaredTarget of runAllWhenChanged) {
      if (!matchesRunAllWhenChanged(changedFile, declaredTarget)) {
        continue;
      }

      const reason = {
        kind: "run-all" as const,
        changedFile,
        declaredTarget
      };
      const reasonKey = `${reason.changedFile}\u0000${reason.declaredTarget}`;

      if (seenReasons.has(reasonKey)) {
        continue;
      }

      seenReasons.add(reasonKey);
      reasons.push(reason);
    }
  }

  return reasons.sort((left, right) => {
    const changedFileComparison = left.changedFile.localeCompare(right.changedFile);
    if (changedFileComparison !== 0) {
      return changedFileComparison;
    }

    return left.declaredTarget.localeCompare(right.declaredTarget);
  });
};

export const resolveRunAllReasons = (
  changedFiles: ReadonlyArray<string>,
  runAllWhenChanged: ReadonlyArray<string>
): Array<RunAllReason> => {
  return createRunAllReasons(changedFiles, runAllWhenChanged);
};

const selectAllTests = (
  testMap: TestMap,
  reasons: ReadonlyArray<RunAllReason>
): RunAllSelection["recommendedTests"] => {
  return sortUniqueStrings(testMap.map((entry) => entry.test)).map((test) => ({
    test,
    reasons
  }));
};

export const resolveChangedFiles = async (
  input: ImpactCommandInput,
  deps: ImpactCommandDeps,
  cwd: string
): Promise<Array<string>> => {
  if (input.changedFiles !== undefined && input.changedFiles.length > 0) {
    return sortUniqueStrings(input.changedFiles.map((path) => normalizePath(path)));
  }

  if (input.base === undefined) {
    return [];
  }

  const gitDiff =
    deps.gitDiff ??
    (async ({ base, head, cwd: nextCwd }) => {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const args = ["diff", "--name-only", base, head];
      const result = await execFileAsync("git", args, { cwd: nextCwd });
      return String(result.stdout)
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter((path) => path.length > 0);
    });

  const head = input.head ?? "HEAD";
  const changedFiles = await gitDiff({
    base: input.base,
    head,
    cwd
  });

  return sortUniqueStrings(changedFiles.map((path) => normalizePath(path)));
};

export const resolveRunAllSelection = async (input: {
  fs: FileSystem;
  testMapPath: string;
  reasons: ReadonlyArray<RunAllReason>;
}): Promise<RunAllSelection | null> => {
  if (input.reasons.length === 0) {
    return null;
  }

  const testMap = await loadTestMap(input.fs, input.testMapPath);

  return {
    reasons: input.reasons,
    recommendedTests: selectAllTests(testMap, input.reasons)
  };
};
