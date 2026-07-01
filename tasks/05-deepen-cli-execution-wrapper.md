# Deepen CLI Execution Wrapper

## Goal

Reduce duplicated CLI command execution policy by introducing a deeper internal Module for diagnostics setup, status tracking, error reporting, and diagnostics flushing.

## Current State

`src/cli.ts` owns several responsibilities:

- help text rendering
- version rendering
- legacy `--changed` normalization
- option validation
- input construction for `impact`
- input construction for `run`
- command registration with `cac`
- diagnostics setup
- command execution
- status and error tracking
- diagnostics flushing
- stderr/stdout behaviour
- main-module detection

The CLI Module earns its keep by the deletion test: deleting it would recreate real parsing and process behaviour elsewhere. The friction is that impact and run command actions duplicate the same diagnostics and error-handling wrapper.

Key references:

- `src/cli.ts`
- `src/diagnostics/diagnostics.ts`
- `src/impact/impact-command.ts`
- `src/run/run-command.ts`
- `tests/cli.test.ts`
- `docs/e2e-impact-selector-spec.md`

## Target State

CLI parsing and command registration can remain in `src/cli.ts`, but repeated execution policy should be concentrated in an internal CLI execution wrapper.

The wrapper should own:

- diagnostics creation when `--diagnostics` is passed
- `success` or `error` status tracking
- converting non-zero command exit codes into diagnostics error status
- catching thrown errors and writing stderr
- flushing diagnostics in a `finally` path

Impact and run action handlers should use the same wrapper so future diagnostics or error behaviour changes have one locality.

## Requirements

- Preserve CLI help text and version output.
- Preserve validation errors and help output behaviour.
- Preserve `--changed` legacy normalization.
- Preserve `run` command handling of arguments after `--`.
- Preserve diagnostics file semantics.
- Preserve command exit codes.
- Preserve stderr output for thrown errors.
- Keep `runCli` public behaviour compatible with current tests.
- Add or update tests around shared execution behaviour if existing tests do not cover it.

## Constraints

- This task should not change impact analysis semantics.
- This task should not change output rendering.
- Run:
  - `pnpm test`
  - `pnpm lint`
- Benchmark is not strictly required unless the implementation touches impact analysis, graph, scanner, resolver, cache, or test matching behaviour.
- Keep `cac` usage unless there is a strong reason and full test coverage for replacement.
- Keep process access isolated to existing CLI/main-module areas.

## Suggested Implementation Notes

The wrapper should be small but deep enough to remove duplicated behaviour from both command actions. Avoid extracting tiny pass-through functions that make the CLI harder to read.

Good signs:

- impact and run actions differ mainly in parsing and the command they execute
- diagnostics creation and flushing are written once
- error handling remains easy to follow

## Success Conditions

- Impact and run command actions no longer duplicate diagnostics/error/status boilerplate.
- CLI tests pass without weakening assertions.
- Behaviour for validation errors, thrown errors, non-zero runner exit codes, and diagnostics flushing is preserved.
- `pnpm test` and `pnpm lint` complete successfully.
