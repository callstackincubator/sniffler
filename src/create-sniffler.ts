import { renderHelp, runCli } from "./cli.js";
import type { ImpactCommandInput, ImpactCommandResult } from "./impact/impact-command.js";
import { runImpactCommand } from "./impact/impact-command.js";
import type { RunCommandDeps, RunCommandInput } from "./run/run-command.js";
import { runRunCommand } from "./run/run-command.js";

export type Sniffler = {
  renderHelp: () => string;
  runCli: typeof runCli;
  impact: (input: ImpactCommandInput) => Promise<ImpactCommandResult>;
  run: (input: RunCommandInput) => Promise<{
    exitCode: number;
  }>;
};

export type CreateSnifflerOptions = RunCommandDeps;

export const createSniffler = (deps: CreateSnifflerOptions = {}): Sniffler => {
  return {
    renderHelp,
    runCli,
    impact: async (input: ImpactCommandInput) => {
      return runImpactCommand(input, deps);
    },
    run: async (input: RunCommandInput) => {
      return runRunCommand(input, deps);
    }
  };
};
