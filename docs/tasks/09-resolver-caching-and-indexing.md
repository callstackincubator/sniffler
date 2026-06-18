# Task 09: Cache And Pre-Index Import Resolution

## Validity

Valid. `buildGraph` resolves each import/re-export independently. Current resolvers repeat workspace package `.find`, tsconfig pattern scans, candidate normalization, and `fs.exists` checks. Many files often import same aliases or package entrypoints.

Proposed solution is valid but must keep resolution context-sensitive. Cache key must include from-file, specifier, and import kind at minimum.

## Implementation Plan

- Add per-`buildGraph` resolution cache keyed by:
  - normalized `fromFile`
  - `specifier`
  - import kind (`import` or `require`)
- Cache all `ResolveResult` values, including external/unresolved.
- Pre-index workspace packages by name in resolve context or helper structure.
- Precompile tsconfig path patterns into prefix/suffix/replacements once per graph build if cleanly scoped.
- Count and test repeated `fs.exists` calls with memory/decorated filesystem for repeated imports.
- Keep resolver order unchanged:
  - relative
  - tsconfig paths
  - package exports
  - workspace package

## Files Likely Touched

- `src/graph/build-graph.ts`
- `src/resolvers/resolve-import.ts`
- `src/resolvers/package-exports-resolver.ts`
- `src/resolvers/workspace-package-resolver.ts`
- `src/resolvers/tsconfig-paths-resolver.ts`
- `tests/package-exports.test.ts`
- `tests/graph.test.ts`
- New resolver cache test if clearer
- `docs/tasks/09-resolver-caching-and-indexing.md`

## Constraints

- Cache must be per build, not global.
- Do not cache across different `ResolveContext` values.
- Relative resolver currently does not check existence; preserve behavior unless task explicitly measures and validates a change.
- Output paths must stay normalized.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm benchmark`

## Acceptance Criteria

- Repeated identical resolution within one graph build avoids duplicate resolver work.
- Workspace package lookup no longer scans full array for every bare specifier.
- Benchmark improves versus baseline, or task notes explain why result was not better and changes are stashed.

## Execution Notes

### 2026-06-18 - codex

- Baseline SHA: `359bbf3009276931bc0d534bac3f858b1879b490`
- Baseline checks: `pnpm test` pass, `pnpm lint` pass, `pnpm benchmark` pass
- Baseline benchmark:
  - `shared-root [1441 files]`: `65.7354 hz`, `15.2125 ms mean`, `±2.25%`
  - `deep-branch [1441 files]`: `94.4699 hz`, `10.5854 ms mean`, `±1.91%`
- Implementation summary: added per-build resolution cache keyed by `fromFile` + `specifier` + import kind, pre-indexed workspace packages by name, precompiled tsconfig path patterns once per graph build, and covered repeated resolver work with a graph test.
- Review findings fixed: test fixture needed `stat` counting for tsconfig source-file candidate probes; switched it to a decorated filesystem wrapper and kept edge count check focused on cache behavior.
- Final benchmark:
  - `shared-root [1441 files]`: `68.5924 hz`, `14.5789 ms mean`, `±3.07%`
  - `deep-branch [1441 files]`: `100.25 hz`, `9.9747 ms mean`, `±1.94%`
- Comparison: both benchmark scenarios improved versus baseline. `shared-root` moved from `65.7354 hz` to `68.5924 hz`; `deep-branch` moved from `94.4699 hz` to `100.25 hz`.
- Decision: committed
- Commit or stash: `175c02f` / `perf(resolver): cache repeated graph resolution`
