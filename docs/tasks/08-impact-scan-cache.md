# Task 08: Use Scan Cache In Impact Flow

## Validity

Valid and likely highest impact. Cache types and validators exist in `src/cache/`, but `selectImpact` always reads and scans every discovered source file. Reusing cached scans for unchanged files can avoid most scanner work in repeated runs.

Proposed solution is valid but larger than scanner micro-optimizations. Needs correctness and trust boundaries.

## Implementation Plan

- Define scanner version constant near scanner/cache boundary.
- Define config hash from relevant config inputs that affect scan/resolve output.
- For each source file:
  - read file or stat as needed
  - compute content hash, preferably from file text because scanner needs text on misses
  - if cache entry path, content hash, config hash, and scanner version match, reuse `scan`
  - otherwise scan file text
- Save updated `GraphCache` with scan results after successful graph build.
- Keep `loadCache` validation as only path for restored cache.
- Add integration tests:
  - unchanged file reuses cached scan
  - changed content invalidates cached scan
  - scanner-version mismatch invalidates cache
  - invalid cache is ignored
- Decide whether resolved edges are reused in this task. Safer first pass: reuse scans only, leave resolved edges for resolver-cache task.

## Files Likely Touched

- `src/impact/impact-command.ts`
- `src/cache/cache-types.ts`
- `src/cache/load-cache.ts`
- `src/cache/save-cache.ts`
- `tests/cache.test.ts`
- `tests/fixtures-integration.test.ts` or new impact cache test
- `docs/tasks/08-impact-scan-cache.md`

## Constraints

- Cache is untrusted. Never skip validation.
- Atomic cache write: temp file then rename.
- Cache path comes from config `cache.path`.
- Do not let cache failure break impact selection; ignore unreadable/invalid cache.
- Keep output deterministic.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm benchmark`

## Acceptance Criteria

- Repeated impact run with unchanged files reuses cached scan data.
- Changed file content invalidates cache entry.
- Benchmark improves versus baseline, or task notes explain why result was not better and changes are stashed.

## Execution Notes

### 2026-06-18 - Codex

- Baseline SHA: `359bbf3009276931bc0d534bac3f858b1879b490`
- Baseline checks: `pnpm test` pass, `pnpm lint` pass, `pnpm benchmark` pass
- Baseline benchmark:
  - `shared-root [1441 files]`: `62.7989 hz` mean `15.9238 ms`
  - `deep-branch [1441 files]`: `92.0310 hz` mean `10.8659 ms`
- Implementation summary: added scan cache reuse in `selectImpact`, cache hash helper and scanner version constant, conditional cache save on refresh, and impact cache integration tests for hit, content miss, version miss, and malformed cache.
- Review findings fixed: replaced per-node full edge filtering with grouped edge map, tightened cache write gating so unchanged runs do not rewrite cache JSON.
- Final checks: `pnpm test` pass, `pnpm lint` pass, `pnpm benchmark` pass
- Final benchmark:
  - `shared-root [1441 files]`: `63.0500 hz` mean `15.8604 ms`
  - `deep-branch [1441 files]`: `87.3931 hz` mean `11.4426 ms`
- Decision: stashed
- Reason: result not clearly better overall; shared-root improved slightly, deep-branch regressed on rerun, so benchmark win not proven.

### 2026-06-18 - Codex restart

- Baseline SHA: `5f74d971eb7e885a39f3462c0fd08bb6f1096a6d`
- Baseline checks: `pnpm test` pass, `pnpm lint` pass, `pnpm benchmark:app --iterations 3 --warmup 1` pass
- Baseline app benchmark:
  - `manifest-target [src/pages/OnboardingPersonalDetails/BaseOnboardingPersonalDetails.tsx]`: mean `3735.5 ms`, median `3626.7 ms`, p95 `4007.2 ms`
  - `app-entry [src/App.tsx]`: mean `3673.8 ms`, median `3696.3 ms`, p95 `3705.9 ms`
  - `routes [src/ROUTES.ts]`: mean `3604.3 ms`, median `3644.1 ms`, p95 `3647.0 ms`
- Benchmark mode: warm cache after 1 warmup run in Expensify App checkout
- Implementation summary: added cache key helper with scanner version + config hash, reused cached scans on cache hits in `selectImpact`, and refreshed cache writes only after miss or invalidation.
- Review findings fixed: cached scan hits now skip scanner work; cache save only happens on refresh and stays atomic through existing temp-file rename.
- Final checks: `pnpm test` pass, `pnpm lint` pass, `pnpm benchmark:app --iterations 3 --warmup 1` pass
- Final app benchmark:
  - `manifest-target [src/pages/OnboardingPersonalDetails/BaseOnboardingPersonalDetails.tsx]`: mean `2884.4 ms`, median `2900.5 ms`, p95 `2918.4 ms`
  - `app-entry [src/App.tsx]`: mean `2895.3 ms`, median `2897.3 ms`, p95 `2925.9 ms`
  - `routes [src/ROUTES.ts]`: mean `2921.5 ms`, median `2898.6 ms`, p95 `2970.5 ms`
- Comparison: warm-cache median improved by about `726 ms` on manifest-target, `799 ms` on app-entry, and `746 ms` on routes versus baseline.
- Decision: committed
