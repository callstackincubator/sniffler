import { renderHelp, runCli } from "./cli.js";
import type { ImpactCommandDeps, ImpactCommandInput, ImpactCommandResult } from "./impact/impact-command.js";
import { runImpactCommand } from "./impact/impact-command.js";

export type Sniffler = {
  renderHelp: () => string;
  runCli: typeof runCli;
  impact: (input: ImpactCommandInput) => Promise<ImpactCommandResult>;
};

export type CreateSnifflerOptions = ImpactCommandDeps;

export const createSniffler = (deps: CreateSnifflerOptions = {}): Sniffler => {
  return {
    renderHelp,
    runCli,
    impact: async (input: ImpactCommandInput) => {
      return runImpactCommand(input, deps);
    }
  };
};
