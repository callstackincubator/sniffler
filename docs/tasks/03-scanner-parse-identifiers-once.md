# Task 03: Parse Identifiers Once Before Keyword Branching

## Validity

Valid but higher risk. Main scan loop probes `startsWithWord("import")`, `startsWithWord("export")`, and `startsWithWord("require")` before generic identifier skipping. Large mostly-code files with many ordinary identifiers pay repeated keyword checks.

Proposed solution is valid: read one identifier token, then branch on token text. Risk: parser subroutines also rely on targeted keyword probes, so change should begin with main loop only unless benchmark and tests support deeper refactor.

## Dependencies

- Prefer after Task 01 and Task 02. They reduce predicate and keyword costs first, making remaining tokenization cost easier to measure.

## Implementation Plan

- In main scan loop, when current char starts an identifier:
  - record `keywordLoc`
  - read identifier once
  - branch on exact token value: `import`, `export`, `require`
  - skip generic identifiers with no extra loop
- Preserve special `import.meta` behavior by checking char after token when token is `import`.
- Keep parser internals unchanged initially.
- Add mostly-code scanner benchmark or test fixture if needed to prove benefit.

## Files Likely Touched

- `src/scanner/scan-file.ts`
- `tests/scanner.test.ts`
- `tests/benchmark.bench.ts` if adding focused scenario is necessary
- `docs/tasks/03-scanner-parse-identifiers-once.md`

## Constraints

- Do not change `readIdentifier` return semantics unless tests prove no regression.
- Do not consume strings/comments as identifiers.
- Preserve current statement finishing behavior after imports/exports.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm benchmark`

## Acceptance Criteria

- Main loop reads an identifier once before keyword dispatch.
- Existing import/export/require detection remains correct.
- Benchmark improves versus baseline, or task notes explain why result was not better and changes are stashed.

## Execution Notes

### 2026-06-18 - Codex desktop

- Baseline SHA: `bda0742842659c98a961f3a078db0293d7a4debd`
- Baseline checks: `pnpm test`, `pnpm lint`, `pnpm benchmark`
- Baseline benchmark:
  - `shared-root [1441 files]`: `53.1146 hz` (mean `18.8272 ms`, samples `82`, rme `±9.65%`)
  - `deep-branch [1441 files]`: `77.2355 hz` (mean `12.9474 ms`, samples `116`, rme `±9.28%`)
- Implementation summary: main loop now reads the identifier token once, branches on exact token text, and preserves `import.meta` handling before keyword dispatch.
- Review findings fixed: none
- Final benchmark:
  - `shared-root [1441 files]`: `74.0489 hz` (mean `13.5046 ms`, samples `112`, rme `±1.87%`)
  - `deep-branch [1441 files]`: `109.03 hz` (mean `9.1714 ms`, samples `164`, rme `±0.73%`)
- Decision: committed
- Commit or stash: pending
