# Task 04: Remove Per-Call Delimiter Set Allocation

## Validity

Valid. `finishStatement`, `parseDynamicImportOrRequire`, and `parseVariableExport` call `skipToTopLevelDelimiter(new Set(...))`. These allocate `Set` instances during parsing, including hot import/export paths.

Proposed solution is valid: use delimiter modes or direct character comparisons. Risk is moderate because delimiter behavior controls how far parser skips nested syntax.

## Implementation Plan

- Replace `skipToTopLevelDelimiter(delimiters: ReadonlySet<string>)` with either:
  - `skipToTopLevelDelimiter(mode: "statement" | "call" | "variable")`, or
  - small predicate functions defined at module scope.
- Avoid allocating new `Set` or closure per call.
- Keep nested paren/brace/bracket depth behavior exactly.
- Add delimiter tests for exported variable declarations with nested objects, arrays, function calls, commas, semicolons, and newlines.

## Files Likely Touched

- `src/scanner/scan-file.ts`
- `tests/scanner.test.ts`
- `docs/tasks/04-scanner-delimiter-allocation.md`

## Constraints

- Preserve behavior in strings, comments, and template literals.
- Do not broaden scanner grammar beyond current support.
- Keep code readable; delimiter mode names must be explicit.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm benchmark`

## Acceptance Criteria

- No `new Set` allocation remains inside scanner parse paths.
- New or existing tests cover nested delimiter cases.
- Benchmark improves versus baseline, or task notes explain why result was not better and changes are stashed.

## Execution Notes

### 2026-06-18 - Codex

- Baseline SHA: `d50e79c`
- Baseline checks: `pnpm test`, `pnpm lint`, `pnpm benchmark`
- Baseline benchmark:
  - `shared-root [1441 files]`: `33.9255 hz` / `29.4763 mean ms` / `±20.75%`
  - `deep-branch [1441 files]`: `71.8840 hz` / `13.9113 mean ms` / `±5.59%`
- Implementation summary: Replaced per-call `Set` allocation in scanner delimiter skipping with fixed `DelimiterMode` comparisons. Added scanner coverage for nested exported variable initializers across objects, arrays, calls, commas, semicolons, and newline boundaries.
- Review findings fixed: None.
- Final benchmark:
  - `shared-root [1441 files]`: `72.8703 hz` / `13.7230 mean ms` / `±2.96%`
  - `deep-branch [1441 files]`: `114.65 hz` / `8.7222 mean ms` / `±0.85%`
- Decision: committed
- Commit or stash:
