#!/usr/bin/env node

import cac from "cac";
import packageJson from "../package.json" with { type: "json" };
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDiagnostics, noopDiagnostics } from "./diagnostics/diagnostics.js";
import { createNodeFileSystem } from "./filesystem/node-filesystem.js";
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
  "  sniffler --version",
  "  sniffler impact --help",
  "  sniffler run --help",
  "  sniffler impact --base <ref> --head <ref>",
  "  sniffler impact [<file> ...]",
  "  sniffler impact --changed <file> [<file> ...]",
  "  sniffler run --base <ref> --head <ref> -- <command> [args ...]",
  "  sniffler run [<file> ...] -- <command> [args ...]",
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
  "  sniffler impact [<file> ...]",
  "  sniffler impact --changed <file> [<file> ...]",
  "",
  "Options:",
  "  --base <ref>      Git base ref for changed-file discovery",
  "  --head <ref>      Git head ref for changed-file discovery",
  "  --diagnostics     Write local timing diagnostics to .sniffler/diagnostics.json",
  "  --format <text|json>  Override the configured output format",
  "  --platform <name> Use platform-aware file resolution",
  "  --config <path>   Path to .sniffler/config.json"
].join("\n");

const runHelpText = [
  "sniffler run",
  "",
  "Usage:",
  "  sniffler run --base <ref> --head <ref> -- <command> [args ...]",
  "  sniffler run [<file> ...] -- <command> [args ...]",
  "  sniffler run --changed <file> [<file> ...] -- <command> [args ...]",
  "",
  "Options:",
  "  --base <ref>      Git base ref for changed-file discovery",
  "  --head <ref>      Git head ref for changed-file discovery",
  "  --diagnostics     Write local timing diagnostics to .sniffler/diagnostics.json",
  "  --platform <name> Use platform-aware file resolution",
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

export const renderVersion = () => {
  return `${packageJson.version}\n`;
};

type ParsedInput<T> =
  | { type: "input"; input: T }
  | { type: "error"; message: string };

type ParsedSelectionOptions = Record<string, unknown> & {
  "--"?: ReadonlyArray<string>;
};

const allowedImpactOptionKeys = new Set(["base", "head", "format", "config", "diagnostics", "platform"]);
const allowedRunOptionKeys = new Set(["base", "head", "config", "diagnostics", "platform"]);

const toFlagName = (key: string): string => {
  return `--${key.replaceAll(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
};

const findUnknownOption = (options: ParsedSelectionOptions, allowedKeys: ReadonlySet<string>): string | undefined => {
  for (const key of Object.keys(options)) {
    if (key === "--") {
      continue;
    }

    if (!allowedKeys.has(key)) {
      return toFlagName(key);
    }
  }

  return undefined;
};

const isHelpFlag = (value: string): boolean => {
  return value === "--help" || value === "-h";
};

const isVersionFlag = (value: string): boolean => {
  return value === "--version" || value === "-v";
};

const parseStringOption = (
  options: ParsedSelectionOptions,
  key: string
): { value?: string; error?: string } => {
  const value = options[key];

  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string") {
    return { error: `--${key} requires a value` };
  }

  return { value };
};

const normalizeOptionalString = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const normalizeLegacyChangedArgs = (
  args: ReadonlyArray<string>
): ParsedInput<ReadonlyArray<string>> => {
  const separatorIndex = args.indexOf("--");
  const selectionArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const trailingArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex);
  const normalizedSelectionArgs: string[] = [];

  for (let index = 0; index < selectionArgs.length; index += 1) {
    const argument = selectionArgs[index];

    if (argument === "--changed") {
      index += 1;

      const changedFiles: string[] = [];

      while (index < selectionArgs.length && !selectionArgs[index].startsWith("-")) {
        changedFiles.push(selectionArgs[index]);
        index += 1;
      }

      index -= 1;

      if (changedFiles.length === 0) {
        return { type: "error", message: "--changed requires at least one file path" };
      }

      normalizedSelectionArgs.push(...changedFiles);
      continue;
    }

    normalizedSelectionArgs.push(argument);
  }

  return {
    type: "input",
    input: [...normalizedSelectionArgs, ...trailingArgs]
  };
};

const buildImpactInput = (
  files: ReadonlyArray<string>,
  options: ParsedSelectionOptions
): ParsedInput<ImpactCommandInput> => {
  const unknownOption = findUnknownOption(options, allowedImpactOptionKeys);

  if (unknownOption !== undefined) {
    return { type: "error", message: `Unknown option: ${unknownOption}` };
  }

  const base = parseStringOption(options, "base");

  if (base.error !== undefined) {
    return { type: "error", message: base.error };
  }

  const head = parseStringOption(options, "head");

  if (head.error !== undefined) {
    return { type: "error", message: head.error };
  }

  const configPath = parseStringOption(options, "config");

  if (configPath.error !== undefined) {
    return { type: "error", message: configPath.error };
  }

  const format = parseStringOption(options, "format");

  if (format.error !== undefined) {
    return { type: "error", message: format.error };
  }

  if (format.value !== undefined && format.value !== "text" && format.value !== "json") {
    return { type: "error", message: "--format must be either text or json" };
  }

  const platform = parseStringOption(options, "platform");

  if (platform.error !== undefined) {
    return { type: "error", message: platform.error };
  }

  const hasFiles = files.length > 0;
  const hasBase = base.value !== undefined;
  const hasHead = head.value !== undefined;

  if (hasFiles && (hasBase || hasHead)) {
    return { type: "error", message: "Use changed files or --base/--head, not both" };
  }

  if (!hasFiles && hasBase !== hasHead) {
    return { type: "error", message: "--base and --head must be provided together" };
  }

  if (!hasFiles && !hasBase && !hasHead) {
    return { type: "error", message: "Provide changed files or both --base and --head" };
  }

  const input: ImpactCommandInput = {};

  if (hasFiles) {
    input.changedFiles = files;
  } else {
    input.base = base.value;
    input.head = head.value;
  }

  if (configPath.value !== undefined) {
    input.configPath = configPath.value;
  }

  if (format.value !== undefined) {
    input.format = format.value;
  }

  const normalizedPlatform = normalizeOptionalString(platform.value);

  if (normalizedPlatform !== undefined) {
    input.platform = normalizedPlatform;
  }

  return { type: "input", input };
};

const buildRunInput = (
  files: ReadonlyArray<string>,
  options: ParsedSelectionOptions,
  rawArgs: ReadonlyArray<string>
): ParsedInput<RunCommandInput> => {
  const unknownOption = findUnknownOption(options, allowedRunOptionKeys);

  if (unknownOption !== undefined) {
    return { type: "error", message: `Unknown option: ${unknownOption}` };
  }

  const separatorIndex = rawArgs.indexOf("--");

  if (separatorIndex === -1) {
    return { type: "error", message: "sniffler run requires a runner command after --" };
  }

  const runnerArgs = rawArgs.slice(separatorIndex + 1);

  if (runnerArgs.length === 0) {
    return { type: "error", message: "sniffler run requires a runner command after --" };
  }

  const selection = buildImpactInput(files, options);

  if (selection.type === "error") {
    return selection;
  }

  const [command, ...args] = runnerArgs;

  return {
    type: "input",
    input: {
      ...selection.input,
      command,
      args
    }
  };
};

const emitValidationError = (io: CliIO, message: string, helpText: string): CliResult => {
  io.stderr(`${message}\n`);
  io.stdout(helpText);
  return { exitCode: 1 };
};

const buildCli = (io: CliIO, deps: CliDeps, rawArgs: ReadonlyArray<string>) => {
  const cli = cac("sniffler");

  cli
    .command("impact [...files]", "Analyze changed files and select impacted E2E tests")
    .option("--base <ref>", "Git base ref for changed-file discovery")
    .option("--head <ref>", "Git head ref for changed-file discovery")
    .option("--diagnostics", "Write local timing diagnostics to .sniffler/diagnostics.json")
    .option("--format <format>", "Override configured output format")
    .option("--platform <name>", "Use platform-aware file resolution")
    .option("--config <path>", "Path to .sniffler/config.json")
    .action(async (files: ReadonlyArray<string> = [], options: ParsedSelectionOptions) => {
      const parsed = buildImpactInput(files, options);

      if (parsed.type === "error") {
        return emitValidationError(io, parsed.message, renderImpactHelp());
      }

      const diagnostics =
        options.diagnostics === true
          ? createDiagnostics({
              enabled: true,
              fs: deps.fs ?? createNodeFileSystem(),
              cwd: deps.cwd ?? process.cwd()
            })
          : noopDiagnostics;
      let status: "success" | "error" = "success";
      let errorMessage: string | undefined;

      try {
        const result = await runImpactCommand(parsed.input, {
          ...deps,
          diagnostics
        });
        if (result.exitCode !== 0) {
          status = "error";
          errorMessage = `exit code ${result.exitCode}`;
        }
        io.stdout(result.output);
        return { exitCode: result.exitCode };
      } catch (error) {
        status = "error";
        const message = error instanceof Error ? error.message : String(error);
        errorMessage = message;
        io.stderr(`${message}\n`);
        return { exitCode: 1 };
      } finally {
        await diagnostics.flush({
          status,
          error: errorMessage
        });
      }
    });

  cli
    .command("run [...files]", "Select impacted E2E tests and execute a command")
    .option("--base <ref>", "Git base ref for changed-file discovery")
    .option("--head <ref>", "Git head ref for changed-file discovery")
    .option("--diagnostics", "Write local timing diagnostics to .sniffler/diagnostics.json")
    .option("--platform <name>", "Use platform-aware file resolution")
    .option("--config <path>", "Path to .sniffler/config.json")
    .allowUnknownOptions()
    .action(async (files: ReadonlyArray<string> = [], options: ParsedSelectionOptions) => {
      const parsed = buildRunInput(files, options, rawArgs);

      if (parsed.type === "error") {
        return emitValidationError(io, parsed.message, renderRunHelp());
      }

      const diagnostics =
        options.diagnostics === true
          ? createDiagnostics({
              enabled: true,
              fs: deps.fs ?? createNodeFileSystem(),
              cwd: deps.cwd ?? process.cwd()
            })
          : noopDiagnostics;
      let status: "success" | "error" = "success";
      let errorMessage: string | undefined;

      try {
        const result = await runRunCommand(parsed.input, {
          ...deps,
          diagnostics
        });
        if (result.exitCode !== 0) {
          status = "error";
          errorMessage = `exit code ${result.exitCode}`;
        }
        return { exitCode: result.exitCode };
      } catch (error) {
        status = "error";
        const message = error instanceof Error ? error.message : String(error);
        errorMessage = message;
        io.stderr(`${message}\n`);
        return { exitCode: 1 };
      } finally {
        await diagnostics.flush({
          status,
          error: errorMessage
        });
      }
    });

  return cli;
};

export const runCli = async (
  argv: ReadonlyArray<string>,
  io: CliIO = defaultCliIO,
  deps: CliDeps = {}
): Promise<CliResult> => {
  const [command, ...rest] = argv;

  if (command === undefined || isHelpFlag(command)) {
    io.stdout(renderHelp());
    return { exitCode: 0 };
  }

  if (isVersionFlag(command)) {
    io.stdout(renderVersion());
    return { exitCode: 0 };
  }

  if (command !== "impact" && command !== "run") {
    io.stderr(`Unknown command: ${command}\n`);
    io.stdout(renderHelp());
    return { exitCode: 1 };
  }

  const normalizedArgs = normalizeLegacyChangedArgs(rest);

  if (normalizedArgs.type === "error") {
    io.stderr(`${normalizedArgs.message}\n`);
    io.stdout(command === "impact" ? renderImpactHelp() : renderRunHelp());
    return { exitCode: 1 };
  }

  const cli = buildCli(io, deps, normalizedArgs.input);
  cli.parse(["node", "sniffler", command, ...normalizedArgs.input], { run: false });

  if (cli.matchedCommandName === undefined) {
    io.stderr(`Unknown command: ${command}\n`);
    io.stdout(renderHelp());
    return { exitCode: 1 };
  }

  try {
    const result = await cli.runMatchedCommand();
    return result ?? { exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    if (command === "impact") {
      io.stdout(renderImpactHelp());
    } else if (command === "run") {
      io.stdout(renderRunHelp());
    } else {
      io.stdout(renderHelp());
    }
    return { exitCode: 1 };
  }
};

export const isMainModule = (
  moduleUrl: string = import.meta.url,
  argvPath: string | undefined = process.argv[1]
): boolean => {
  if (argvPath === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
};

if (isMainModule()) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}
