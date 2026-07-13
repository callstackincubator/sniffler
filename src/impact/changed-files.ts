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

  if (input.base === undefined && input.workingTree !== true) {
    return [];
  }

  const parsePaths = (stdout: string): Array<string> => {
    return stdout
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter((path) => path.length > 0);
  };

  const discoveredFiles: string[] = [];

  if (input.base !== undefined) {
    const gitDiff =
      deps.gitDiff ??
      (async ({ base, head, cwd: nextCwd }) => {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        const result = await execFileAsync("git", ["diff", "--name-only", base, head], { cwd: nextCwd });
        return parsePaths(String(result.stdout));
      });

    discoveredFiles.push(...await gitDiff({
      base: input.base,
      head: input.head ?? "HEAD",
      cwd
    }));
  }

  if (input.workingTree === true) {
    const workingTree =
      deps.workingTree ??
      (async ({ cwd: nextCwd }) => {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        const commands = [
          ["diff", "--name-only"],
          ["diff", "--name-only", "--cached"],
          ["ls-files", "--others", "--exclude-standard"]
        ];
        const results = await Promise.all(
          commands.map(async (args) => await execFileAsync("git", args, { cwd: nextCwd }))
        );
        return results.flatMap((result) => parsePaths(String(result.stdout)));
      });

    discoveredFiles.push(...await workingTree({ cwd }));
  }

  return sortUniqueStrings(discoveredFiles.map((path) => normalizePath(path)));
};
