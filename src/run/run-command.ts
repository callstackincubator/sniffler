import { spawn } from "node:child_process";
import { normalizePath } from "../filesystem/path-utils.js";
import type { ImpactCommandDeps, SelectImpactInput } from "../impact/impact-command.js";
import { selectImpact } from "../impact/impact-command.js";

export type RunCommandInput = SelectImpactInput & {
  command: string;
  args: ReadonlyArray<string>;
};

export type Runner = (input: {
  command: string;
  args: ReadonlyArray<string>;
  cwd: string;
}) => Promise<{
  exitCode: number;
}>;

export type RunCommandDeps = ImpactCommandDeps & {
  runner?: Runner;
};

const getCwd = (deps: ImpactCommandDeps): string => {
  return normalizePath(deps.cwd ?? process.cwd());
};

const createNodeRunner = (): Runner => {
  return async ({ command, args, cwd }) => {
    return await new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        shell: process.platform === "win32",
        stdio: "inherit"
      });

      child.once("error", () => {
        resolve({ exitCode: 1 });
      });

      child.once("close", (code) => {
        resolve({ exitCode: typeof code === "number" ? code : 1 });
      });
    });
  };
};

export const runRunCommand = async (
  input: RunCommandInput,
  deps: RunCommandDeps
): Promise<{
  exitCode: number;
}> => {
  const impact = await selectImpact(input, deps);
  const tests = [...new Set(impact.recommendedTests.map((entry) => entry.test))].sort((left, right) =>
    left.localeCompare(right)
  );

  if (tests.length === 0) {
    return { exitCode: 0 };
  }

  const runner = deps.runner ?? createNodeRunner();
  const cwd = getCwd(deps);

  return await runner({
    command: input.command,
    args: [...input.args, ...tests],
    cwd
  });
};
