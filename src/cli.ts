#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import type { ImpactCommandDeps, ImpactCommandInput } from "./impact/impact-command.js";
import { runImpactCommand } from "./impact/impact-command.js";

export type CliSubcommand = "impact";

export type CliIO = {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
};

export type CliDeps = ImpactCommandDeps;

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
  "  sniffler impact --base <ref> --head <ref>",
  "  sniffler impact --changed <file> [<file> ...]",
  "",
  "Commands:",
  "  impact    Analyze changed files and select impacted E2E tests"
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

export const renderHelp = () => {
  return `${helpText}\n`;
};

export const renderImpactHelp = () => {
  return `${impactHelpText}\n`;
};

type ParsedImpactArgs =
  | { type: "help" }
  | { type: "error"; message: string }
  | { type: "input"; input: ImpactCommandInput };

const parseImpactArgs = (args: ReadonlyArray<string>): ParsedImpactArgs => {
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
    const parsed = parseImpactArgs(rest);

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

  io.stderr(`Unknown command: ${command}\n`);
  io.stdout(renderHelp());
  return { exitCode: 1 };
};

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}
