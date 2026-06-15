#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export type CliSubcommand = "impact";

export type CliIO = {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
};

export type CliResult = {
  exitCode: number;
};

const defaultCliIO: CliIO = {
  stdout: (chunk: string) => {
    process.stdout.write(chunk);
  },
  stderr: (chunk: string) => {
    process.stderr.write(chunk);
  }
};

const helpText = [
  "sniffler",
  "",
  "Usage:",
  "  sniffler --help",
  "  sniffler impact --help",
  "",
  "Commands:",
  "  impact    Analyze changed files and select impacted E2E tests"
].join("\n");

const impactHelpText = [
  "sniffler impact",
  "",
  "Usage:",
  "  sniffler impact --help",
  "",
  "This command will be implemented in the next task."
].join("\n");

export const renderHelp = () => {
  return `${helpText}\n`;
};

export const renderImpactHelp = () => {
  return `${impactHelpText}\n`;
};

export const runCli = async (
  argv: ReadonlyArray<string>,
  io: CliIO = defaultCliIO
): Promise<CliResult> => {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    io.stdout(renderHelp());
    return { exitCode: 0 };
  }

  if (command === "impact") {
    if (rest.includes("--help") || rest.includes("-h")) {
      io.stdout(renderImpactHelp());
      return { exitCode: 0 };
    }

    io.stderr("The impact command is not implemented yet.\n");
    return { exitCode: 1 };
  }

  io.stderr(`Unknown command: ${command}\n`);
  io.stdout(renderHelp());
  return { exitCode: 1 };
};

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}
