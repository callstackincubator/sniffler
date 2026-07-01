# Deepen Test Recommendation

## Goal

Concentrate test recommendation policy in one Module so dependency matching, containment matching, shared targets, run-all selection, de-duplication, and reason ordering have better locality.

## Current State

Test recommendation policy is split across multiple Modules:

- `src/test-map/match-tests.ts` handles dependency reasons, containment reasons, glob matching, de-duplication, and reason sorting.
- `src/impact/impact-command.ts` handles `tests.runAllWhenChanged`, all-test selection, `tests.sharedTargets`, and `tests.invalidateSubtreeWhenTouched` root selection.
- `src/output/text-output.ts` and `src/output/json-output.ts` depend on the reason shapes and ordering produced by matching.

This split makes the reason vocabulary leak across seams. Adding or changing a recommendation rule requires touching the impact command and matching Module together.

Key references:

- `src/test-map/match-tests.ts`
- `src/test-map/load-test-map.ts`
- `src/impact/impact-command.ts`
- `src/graph/traverse-impact.ts`
- `src/graph/traverse-containment.ts`
- `src/output/text-output.ts`
- `src/output/json-output.ts`
- `tests/test-match.test.ts`
- `tests/impact-run-all.test.ts`
- `tests/shared-targets.test.ts`
- `tests/impact-containment.test.ts`
- `docs/config.md`

## Target State

There should be a deeper test recommendation Module that owns the rules for turning changed files, impact paths, containment paths, and test map entries into recommended tests.

The Module should own these behaviours together:

- `tests.runAllWhenChanged`
- selecting every mapped test for run-all reasons
- `tests.sharedTargets`
- dependency target matching
- containment target matching
- reason de-duplication
- reason sorting
- stable test sorting

`selectImpact` should not need to know the details of reason construction. It should supply the needed inputs and receive recommended tests plus any early-run-all decision data required to preserve current short-circuit behaviour.

## Requirements

- Preserve the `TestMatchReason` output shape unless an explicitly reviewed migration is added.
- Preserve stable sorting of recommended tests and reasons.
- Preserve exact path matching and glob matching behaviour.
- Preserve run-all short-circuit behaviour: if `tests.runAllWhenChanged` matches, Sniffler must not build the graph.
- Preserve `tests.sharedTargets` semantics.
- Preserve containment reason shape including synthetic containment path edge details where currently present.
- Keep output Modules compatible.
- Update tests so recommendation rules can be verified through the recommendation Module seam.

## Constraints

- This affects analysis behaviour and may affect performance, so run:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm benchmark`
- Do not change config schema or documented semantics in `docs/config.md`.
- Do not move graph traversal into the recommendation Module. It should consume traversal results, not compute graph traversal itself.
- Do not hide all reason details from output rendering; output still needs enough data to explain why a test was selected.

## Suggested Implementation Notes

One useful direction is to separate "recommendation policy" from "graph traversal":

- impact traversal computes reverse dependency paths
- containment traversal computes containment paths
- recommendation combines paths with test-map rules and produces test reasons

The Module can expose helpers for early run-all detection if that keeps the short-circuit readable in `selectImpact`.

## Success Conditions

- Recommendation rules live together instead of being split between `impact-command.ts` and `match-tests.ts`.
- Adding a new test recommendation reason would primarily touch one Module.
- Existing tests for run-all, shared targets, containment, and match ordering pass.
- New or adjusted tests cover recommendation policy through the new seam.
- `pnpm test`, `pnpm lint`, and `pnpm benchmark` complete successfully.
