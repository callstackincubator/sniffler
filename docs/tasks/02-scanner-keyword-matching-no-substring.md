# Task 02: Avoid Substring Allocation In Keyword Checks

## Validity

Valid. `startsWithWord` uses `text.slice(state.index, state.index + word.length) !== word`. This allocates short strings for every keyword probe. Scanner calls this often for `import`, `export`, `require`, `from`, `type`, `as`, and export modifiers.

Cause is real. Proposed solution is valid: `text.startsWith(word, state.index)` or a manual matcher avoids substring allocation while preserving boundary checks.

## Implementation Plan

- Replace `slice` comparison in `startsWithWord` with `text.startsWith(word, state.index)` or manual char-code checks.
- Keep identifier boundary check before and after keyword.
- Prefer one helper with same call sites to minimize blast radius.
- If manual matcher is used, benchmark it against `startsWith`; keep simpler option unless benchmark clearly favors manual code.

## Files Likely Touched

- `src/scanner/scan-file.ts`
- `tests/scanner.test.ts`
- `docs/tasks/02-scanner-keyword-matching-no-substring.md`

## Constraints

- `import.meta` handling must remain unchanged.
- Keyword boundaries must prevent false positives inside identifiers like `important`, `exportsValue`, and `required`.
- Do not combine with identifier-token refactor from Task 03.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm benchmark`

## Acceptance Criteria

- Keyword matching no longer slices text.
- Boundary behavior is covered by tests or existing tests.
- Benchmark improves versus baseline, or task notes explain why result was not better and changes are stashed.

## Execution Notes

### 2026-06-17 - codex

- Baseline SHA: `8a162f6c6ebc7eef15a98dda69d10d31587d852d`
- Baseline checks: `pnpm test`, `pnpm lint`, `pnpm benchmark`
- Baseline benchmark:
  - `shared-root [1441 files]`: `66.1105 hz` mean `15.1262 ms`, `±4.19%`, `100` samples
  - `deep-branch [1441 files]`: `103.85 hz` mean `9.6291 ms`, `±2.44%`, `156` samples
- Implementation summary:
  - Replaced the scanner's substring keyword probe with `text.startsWith(word, state.index)`.
  - Added a regression test covering `important`, `exportsValue`, `required`, and `import.meta` keyword-boundary cases.
- Review findings fixed:
  - Tightened the new scanner test to use type-safe assertions for the `re-export` branch and confirmed the expected specifier location.
- Final benchmark:
  - Run 1:
    - `shared-root [1441 files]`: `72.2055 hz` mean `13.8494 ms`, `±3.02%`, `109` samples
    - `deep-branch [1441 files]`: `73.6255 hz` mean `13.5822 ms`, `±10.05%`, `111` samples
  - Run 2:
    - `shared-root [1441 files]`: `75.5729 hz` mean `13.2323 ms`, `±3.10%`, `114` samples
    - `deep-branch [1441 files]`: `118.98 hz` mean `8.4046 ms`, `±0.76%`, `179` samples
- Decision: committed
- Commit or stash: pending
