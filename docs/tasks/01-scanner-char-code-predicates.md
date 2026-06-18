# Task 01: Replace Scanner Regex Predicates With Char-Code Checks

## Validity

Valid. `src/scanner/scan-file.ts` calls `isIdentifierStart`, `isIdentifierChar`, and `isWhitespace` inside hot scan loops. These helpers currently run regex checks per character. For scanner throughput, ASCII char-code predicates avoid regex dispatch and temporary match machinery.

Cause is real in current code. Proposed solution is low risk because scanner syntax support is ASCII-oriented for identifiers/keywords already.

## Implementation Plan

- Replace regex helpers with module-scope char-code predicates.
- Keep behavior for current supported scanner grammar:
  - identifier start: `A-Z`, `a-z`, `_`, `$`
  - identifier char: identifier start plus `0-9`
  - whitespace: current practical JS whitespace handled by scanner, at least space, tab, LF, CR, vertical tab, form feed
- Add scanner tests if current tests do not cover CRLF, tabs, and identifier boundary cases.
- Do not add dependencies or AST parsing.

## Files Likely Touched

- `src/scanner/scan-file.ts`
- `tests/scanner.test.ts`
- `docs/tasks/01-scanner-char-code-predicates.md`

## Constraints

- Preserve all current scanner output exactly.
- Preserve warnings and locations.
- Avoid broad Unicode identifier support in this task; it would alter scanner scope.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm benchmark`

## Acceptance Criteria

- Regex literals no longer used for identifier or whitespace hot-path predicates.
- Scanner tests pass unchanged or with added coverage.
- Benchmark improves versus baseline, or task notes explain why result was not better and changes are stashed.

## Execution Notes

### 2026-06-18 - codex

- Baseline SHA: `417e174a4758060807eb0fee79dcb001aaced75d`
- Baseline checks: `pnpm test`, `pnpm lint`, `pnpm benchmark:app --iterations 3 --warmup 1`
- Baseline benchmark:
  - `manifest-target [src/pages/OnboardingPersonalDetails/BaseOnboardingPersonalDetails.tsx]`: `3050.1875 ms` mean, `3138.8018 ms` median, `2852.4646 ms` min, `3159.2960 ms` max
  - `app-entry [src/App.tsx]`: `2941.3795 ms` mean, `2951.0513 ms` median, `2914.1283 ms` min, `2958.9589 ms` max
  - `routes [src/ROUTES.ts]`: `2984.1917 ms` mean, `2964.6685 ms` median, `2871.5385 ms` min, `3116.3681 ms` max
- Implementation summary:
  - Replaced regex-based identifier and whitespace predicates with module-scope char-code checks in `src/scanner/scan-file.ts`.
  - Added scanner coverage for tabs, CRLF line endings, and identifier-boundary cases in `tests/scanner.test.ts`.
- Review findings fixed:
  - None.
- Final benchmark:
  - `manifest-target [src/pages/OnboardingPersonalDetails/BaseOnboardingPersonalDetails.tsx]`: `2881.5222 ms` mean, `2863.3678 ms` median, `2860.9105 ms` min, `2920.2882 ms` max
  - `app-entry [src/App.tsx]`: `2823.5429 ms` mean, `2829.1131 ms` median, `2809.1510 ms` min, `2832.3647 ms` max
  - `routes [src/ROUTES.ts]`: `2892.1120 ms` mean, `2897.3919 ms` median, `2871.2225 ms` min, `2907.7216 ms` max
- Decision: committed
- Commit or stash: `perf(scanner): replace regex predicates with char-code checks`

### 2026-06-17 - codex

- Baseline SHA: `8a162f6c6ebc7eef15a98dda69d10d31587d852d`
- Baseline checks: `pnpm test`, `pnpm lint`, `pnpm benchmark`
- Baseline benchmark:
  - `shared-root [1441 files]`: `70.1071 hz` mean `14.2639 ms`, `±5.14%`, `106` samples
  - `deep-branch [1441 files]`: `107.79 hz` mean `9.2777 ms`, `±2.81%`, `162` samples
- Implementation summary:
  - Replaced regex-based identifier and whitespace predicates with ASCII char-code checks in `src/scanner/scan-file.ts`.
  - Added scanner coverage for tabs, CRLF line endings, and keyword-boundary cases in `tests/scanner.test.ts`.
- Review findings fixed:
  - Adjusted the new test's expected dynamic-import column after accounting for the inserted tab.
- Final benchmark:
  - Run 1:
    - `shared-root [1441 files]`: `54.4760 hz` mean `18.3567 ms`, `±6.73%`, `82` samples
    - `deep-branch [1441 files]`: `105.56 hz` mean `9.4737 ms`, `±1.56%`, `159` samples
  - Run 2:
    - `shared-root [1441 files]`: `77.7037 hz` mean `12.8694 ms`, `±2.35%`, `117` samples
    - `deep-branch [1441 files]`: `98.9671 hz` mean `10.1044 ms`, `±3.04%`, `149` samples
- Decision: stashed
- Commit or stash: pending
