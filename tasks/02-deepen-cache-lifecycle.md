# Deepen Cache Lifecycle

## Goal

Make cache behaviour a deeper Module so source scan reuse, resolved-edge reuse, metadata staging, cache refresh decisions, and cache saving policy are concentrated outside `selectImpact`.

## Current State

Cache-related files already provide useful building blocks:

- `src/cache/load-cache.ts` loads and validates cache shape.
- `src/cache/save-cache.ts` saves cache atomically.
- `src/cache/cache-key.ts` computes config hashes.
- `src/cache/stale-checker.ts` decides whether an entry is stale.
- `src/cache/cache-store.ts` wraps cached entries and stale checks.

However, much of the cache lifecycle still lives in `src/impact/impact-command.ts`:

- choosing content-hash or metadata stale strategy
- deciding whether cached resolved edges can be reused
- counting scan hits, scan misses, and cached edge files
- reading source text and hashing it
- collecting scanner warnings
- staging metadata for cache entries
- building `GraphNode` objects
- regrouping graph edges by `from` before saving
- deciding whether cache needs refresh
- swallowing save failures so impact selection can continue

The current tests also show the seam is shallow. `tests/impact-cache.test.ts` mocks `scanFileText` and `resolveImport` through `selectImpact` to prove cache behaviour. That means the natural test surface for cache lifecycle does not really exist yet.

Key references:

- `src/impact/impact-command.ts`
- `src/cache/cache-store.ts`
- `src/cache/load-cache.ts`
- `src/cache/save-cache.ts`
- `src/cache/stale-checker.ts`
- `src/cache/cache-key.ts`
- `src/cache/cache-types.ts`
- `tests/impact-cache.test.ts`
- `tests/cache.test.ts`
- `tests/stale-checker.test.ts`

## Target State

Cache lifecycle should become a deeper Module used by impact selection. The impact workflow should ask for graph-ready scanned source nodes and later ask the cache lifecycle to persist resolved graph data when needed.

The cache lifecycle Module should own:

- cache loading inputs needed for impact analysis
- stale checker selection
- source scan reuse
- source metadata collection
- content hashing
- resolved-edge reuse eligibility
- hit/miss counters
- scanner warning forwarding data
- cache refresh decisions
- preparing and saving the next graph cache
- ignoring cache write failures

The exact file layout is up to the implementer, but the result should move cache policy out of the orchestration body in `selectImpact`.

## Requirements

- Preserve cache file format from `src/cache/cache-types.ts`.
- Preserve `SCANNER_VERSION` and `getCacheConfigHash` behaviour.
- Preserve content-hash stale mode and metadata stale mode.
- Preserve the existing resolved-edge reuse rule unless a test-backed improvement is explicitly included.
- Preserve the guarantee that cache write failure does not fail impact selection.
- Preserve scanner warnings in the final `warnings` output and diagnostics.
- Keep cache generated data deterministic for stable tests and CI.
- Make cache lifecycle testable without mocking scanner and resolver through the entire impact pipeline.

## Constraints

- This affects scan/parse/interpret performance, so run:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm benchmark`
- Include benchmark results in PR notes.
- Do not change cache path defaults or config schema.
- Do not broaden source discovery or import resolution behaviour.
- Do not make cache correctness depend on process-global state.
- Keep filesystem access behind the existing `FileSystem` abstraction.

## Suggested Implementation Notes

Consider adding a cache lifecycle Module that takes:

- filesystem
- cwd
- normalized config
- platform
- diagnostics
- source files
- optional injected stale checker/cache store factory for tests

And returns:

- graph nodes
- warnings or scanner warning records
- cache metrics
- a post-graph save operation or data needed to save after graph build

Avoid hard-coding this shape if another shape gives better depth, but keep the interface small enough that callers do not need to know cache internals.

## Success Conditions

- Cache policy no longer dominates `selectImpact`.
- Cache lifecycle has a natural test surface.
- Existing cache behaviour is preserved.
- `tests/impact-cache.test.ts` is simplified or supplemented with focused cache lifecycle tests.
- Cache save remains atomic and failure-tolerant.
- `pnpm test`, `pnpm lint`, and `pnpm benchmark` complete successfully.
