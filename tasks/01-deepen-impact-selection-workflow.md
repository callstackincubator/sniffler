# Deepen Impact Selection Workflow

## Goal

Make the impact selection workflow easier to change and test by concentrating policy-heavy steps behind internal Modules while preserving the existing public behaviour of `selectImpact`, `runImpactCommand`, `sniffler impact`, and `sniffler run`.

## Current State

`selectImpact` in `src/impact/impact-command.ts` is the central Module for turning changed files into recommended E2E tests. It currently handles many separate concerns in one Implementation:

- config loading
- legacy test-map conversion
- changed-file resolution from direct input or Git
- `tests.runAllWhenChanged`
- cache loading, stale policy, source scan reuse, cache save preparation
- workspace discovery
- TSConfig paths loading
- source file discovery
- scanner warnings
- graph building
- impact traversal
- containment traversal through `tests.invalidateSubtreeWhenTouched`
- `tests.sharedTargets`
- test matching
- diagnostics counters and timing

This Module earns its keep by the deletion test: deleting it would scatter the impact workflow across CLI, run command, cache, graph, test-map, and output code. The problem is that too many implementation details now live at the same level, so changing one policy requires understanding the whole pipeline.

Key references:

- `src/impact/impact-command.ts`
- `src/run/run-command.ts`
- `src/cli.ts`
- `src/graph/build-graph.ts`
- `src/test-map/match-tests.ts`
- `src/cache/*`
- `docs/e2e-impact-selector-spec.md`
- `docs/config.md`

## Target State

`selectImpact` should remain the main seam for callers, but its Implementation should read as a clear workflow. Internally, coherent policies should move behind smaller private or package-local Modules with meaningful depth.

The target shape should make it possible to understand the high-level pipeline without reading cache details, source discovery details, matching details, or containment policy inline.

After the change, `selectImpact` should mostly coordinate these domain concepts:

- load normalized configuration
- resolve changed files
- apply early run-all selection if applicable
- prepare graph inputs from source discovery, scan, and cache
- build the dependency graph
- compute impact and containment
- recommend tests
- return stable output

Do not change the public command behaviour or output shape as part of this task.

## Requirements

- Keep `selectImpact` and `runImpactCommand` exported with compatible behaviour.
- Preserve all existing diagnostics names unless there is a strong reason to rename them.
- Preserve `runAllWhenChanged` short-circuit behaviour: when it matches, Sniffler should skip workspace discovery, source scanning, graph build, cache work, and traversal.
- Preserve config loading rules from `docs/config.md`.
- Preserve the main pipeline from `docs/e2e-impact-selector-spec.md`: config -> workspace discovery -> file discovery -> scan -> resolve -> graph -> impact -> test map -> output.
- Keep all file paths normalized the same way they are today.
- Avoid introducing a new public interface unless the change genuinely requires it.
- Prefer internal Modules with a small interface and enough implementation depth to improve locality.
- Add or update tests around the new internal seams where behaviour is moved.

## Constraints

- This affects analysis performance, so run the benchmark before finishing:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm benchmark`
- If the benchmark output changes materially, capture and explain the result in the PR notes.
- Do not refactor resolver semantics, cache semantics, or test matching semantics beyond what is needed to move workflow policy.
- Do not change generated output text or JSON unless explicitly required and covered by tests.
- Do not modify unrelated files such as `expo-app/`.

## Suggested Implementation Notes

Good first splits to evaluate:

- changed-file resolution
- source inventory preparation
- graph input preparation
- impact plus containment calculation
- output assembly and diagnostics recording

Use the deletion test before extracting anything. If deleting a proposed Module would only move a few lines without concentrating knowledge, keep it inline.

## Success Conditions

- `selectImpact` is easier to scan as a high-level workflow.
- Moved policy has locality: related behaviour lives in one Module instead of being split across `selectImpact`.
- Existing tests pass.
- New or adjusted tests cover moved behaviour through the new internal seams.
- `pnpm test`, `pnpm lint`, and `pnpm benchmark` complete successfully.
- Public CLI output and JSON output remain compatible with current tests.
