# Task 10: Precompute Graph Edge Sort Keys

## Validity

Valid. `src/graph/build-graph.ts` edge sort comparator calls `JSON.stringify(left.entities)`, `JSON.stringify(right.entities)`, and same for `reExports`. Sort comparators may run many times, so repeated serialization is avoidable.

Proposed solution is valid and low risk if stable sort semantics are preserved.

## Implementation Plan

- Before sorting edges, map each edge to `{ edge, entityKey, reExportKey }`.
- Sort using precomputed keys after `from`, `to`, and `resolver`.
- Return only sorted edges.
- Keep JSON serialization format for keys unless introducing a proven stable manual key.
- Add test only if existing graph/output tests do not lock stable order enough.

## Files Likely Touched

- `src/graph/build-graph.ts`
- `tests/graph.test.ts`
- `docs/tasks/10-graph-sort-key-precompute.md`

## Constraints

- Sort output must remain byte-for-byte equivalent for existing tests.
- Do not change edge data shape.
- Keep key computation local to `buildGraph`.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm benchmark`

## Acceptance Criteria

- Sort comparator does not call `JSON.stringify`.
- Edge order remains stable.
- Benchmark improves versus baseline, or task notes explain why result was not better and changes are stashed.

## Execution Notes

### 2026-06-18 - codex

- Baseline SHA: `7e3d87ef702eb9cdb2219ad7b85f98d9be6b5834`
- Baseline checks: `pnpm test`, `pnpm lint`, `pnpm benchmark`
- Baseline benchmark:
  - `shared-root [1441 files]`: `70.4565 hz`, `14.1932 ms mean`, `±3.51% rme`
  - `deep-branch [1441 files]`: `104.18 hz`, `9.5985 ms mean`, `±2.64% rme`
- Machine notes: local dev machine, pnpm v11.5.1, Vitest 3.2.6
- Implementation summary: precomputed `entityKey` and `reExportKey` once per edge, then sorted decorated edges and returned original edge objects.
- Review findings fixed: none.
- Final benchmark:
  - `shared-root [1441 files]`: `76.3880 hz`, `13.0911 ms mean`, `±1.81% rme`
  - `deep-branch [1441 files]`: `105.26 hz`, `9.5000 ms mean`, `±4.32% rme`
- Baseline vs final: both scenarios improved on mean time; shared-root improved by `1.1021 ms`, deep-branch improved by `0.0985 ms`.
- Decision: committed.
- Commit or stash: `commit`
