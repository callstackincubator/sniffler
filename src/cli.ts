#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import type { ImpactCommandInput } from "./impact/impact-command.js";
import { runImpactCommand } from "./impact/impact-command.js";
import type { RunCommandDeps, RunCommandInput } from "./run/run-command.js";
import { runRunCommand } from "./run/run-command.js";

export type CliSubcommand = "impact" | "run";

export type CliIO = {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
};

export type CliDeps = RunCommandDeps;

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
  "  sniffler run --help",
  "  sniffler impact --base <ref> --head <ref>",
  "  sniffler impact --changed <file> [<file> ...]",
  "  sniffler run --base <ref> --head <ref> -- <command> [args ...]",
  "  sniffler run --changed <file> [<file> ...] -- <command> [args ...]",
  "",
  "Commands:",
  "  impact    Analyze changed files and select impacted E2E tests",
  "  run       Select impacted E2E tests and execute a command"
].join("\n");

const impactHelpText = [
  "sniffler impact",
  "",
  "Usage:",
  "  sniffler impact --base <ref> --head <ref>",
  "  sniffler impact --changed <file> [<file> ...]",
  "",
  "Options:",
  "  --base <ref>      Git base ref for changed-file discovery",
  "  --head <ref>      Git head ref for changed-file discovery",
  "  --changed <file>  Explicit changed file path (repeatable)",
  "  --format <text|json>  Override the configured output format",
  "  --config <path>   Path to .sniffler/config.json"
].join("\n");

const runHelpText = [
  "sniffler run",
  "",
  "Usage:",
  "  sniffler run --base <ref> --head <ref> -- <command> [args ...]",
  "  sniffler run --changed <file> [<file> ...] -- <command> [args ...]",
  "",
  "Options:",
  "  --base <ref>      Git base ref for changed-file discovery",
  "  --head <ref>      Git head ref for changed-file discovery",
  "  --changed <file>  Explicit changed file path (repeatable)",
  "  --config <path>   Path to .sniffler/config.json"
].join("\n");

export const renderHelp = () => {
  return `${helpText}\n`;
};

export const renderImpactHelp = () => {
  return `${impactHelpText}\n`;
};

export const renderRunHelp = () => {
  return `${runHelpText}\n`;
};

type ParsedSelectionArgs =
  | { type: "help" }
  | { type: "error"; message: string }
  | { type: "input"; input: ImpactCommandInput };

const parseSelectionArgs = (
  args: ReadonlyArray<string>,
  allowFormat = true
): ParsedSelectionArgs => {
  const input: ImpactCommandInput = {};
  const changedFiles: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--help" || argument === "-h") {
      return { type: "help" };
    }

    if (argument === "--base") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { type: "error", message: "--base requires a value" };
      }

      input.base = value;
      index += 1;
      continue;
    }

    if (argument === "--head") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { type: "error", message: "--head requires a value" };
      }

      input.head = value;
      index += 1;
      continue;
    }

    if (argument === "--changed") {
      index += 1;

      while (index < args.length && !args[index].startsWith("-")) {
        changedFiles.push(args[index]);
        index += 1;
      }

      index -= 1;

      if (changedFiles.length === 0) {
        return { type: "error", message: "--changed requires at least one file path" };
      }

      continue;
    }

    if (argument === "--config") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { type: "error", message: "--config requires a value" };
      }

      input.configPath = value;
      index += 1;
      continue;
    }

    if (argument === "--format") {
      if (!allowFormat) {
        return { type: "error", message: `Unknown option: ${argument}` };
      }

      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { type: "error", message: "--format requires a value" };
      }

      if (value !== "text" && value !== "json") {
        return { type: "error", message: "--format must be either text or json" };
      }

      input.format = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("-")) {
      return { type: "error", message: `Unknown option: ${argument}` };
    }

    return { type: "error", message: `Unexpected argument: ${argument}` };
  }

  if (changedFiles.length > 0) {
    input.changedFiles = changedFiles;
  }

  return { type: "input", input };
};

type ParsedRunArgs =
  | { type: "help" }
  | { type: "error"; message: string }
  | { type: "input"; input: RunCommandInput };

const parseRunArgs = (args: ReadonlyArray<string>): ParsedRunArgs => {
  const separatorIndex = args.indexOf("--");

  if (separatorIndex === -1) {
    if (args.includes("--help") || args.includes("-h")) {
      return { type: "help" };
    }

    return { type: "error", message: "sniffler run requires a runner command after --" };
  }

  const selectionArgs = args.slice(0, separatorIndex);
  const runnerArgs = args.slice(separatorIndex + 1);

  if (runnerArgs.length === 0) {
    return { type: "error", message: "sniffler run requires a runner command after --" };
  }

  const parsedSelectionArgs = parseSelectionArgs(selectionArgs, false);

  if (parsedSelectionArgs.type !== "input") {
    return parsedSelectionArgs;
  }

  const [command, ...rest] = runnerArgs;

  if (command === undefined) {
    return { type: "error", message: "sniffler run requires a runner command after --" };
  }

  return {
    type: "input",
    input: {
      ...parsedSelectionArgs.input,
      command,
      args: rest
    }
  };
};

export const runCli = async (
  argv: ReadonlyArray<string>,
  io: CliIO = defaultCliIO,
  deps: CliDeps = {}
): Promise<CliResult> => {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    io.stdout(renderHelp());
    return { exitCode: 0 };
  }

  if (command === "impact") {
    const parsed = parseSelectionArgs(rest);

    if (parsed.type === "help") {
      io.stdout(renderImpactHelp());
      return { exitCode: 0 };
    }

    if (parsed.type === "error") {
      io.stderr(`${parsed.message}\n`);
      io.stdout(renderImpactHelp());
      return { exitCode: 1 };
    }

    try {
      const result = await runImpactCommand(parsed.input, deps);
      io.stdout(result.output);
      return { exitCode: result.exitCode };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr(`${message}\n`);
      return { exitCode: 1 };
    }
  }

  if (command === "run") {
    const parsed = parseRunArgs(rest);

    if (parsed.type === "help") {
      io.stdout(renderRunHelp());
      return { exitCode: 0 };
    }

    if (parsed.type === "error") {
      io.stderr(`${parsed.message}\n`);
      io.stdout(renderRunHelp());
      return { exitCode: 1 };
    }

    try {
      const result = await runRunCommand(parsed.input, deps);
      return { exitCode: result.exitCode };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr(`${message}\n`);
      return { exitCode: 1 };
    }
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
