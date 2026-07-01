import { normalizePath } from "../filesystem/path-utils.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import type { ImpactCommandDeps, ImpactCommandInput } from "./impact-command.js";

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
