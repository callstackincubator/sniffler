import { renderHelp, runCli } from "./cli.js";

export type Sniffler = {
  renderHelp: () => string;
  runCli: typeof runCli;
};

export const createSniffler = (): Sniffler => {
  return {
    renderHelp,
    runCli
  };
};
