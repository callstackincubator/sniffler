# Deepen Graph Edge Semantics

## Goal

Improve locality around graph edge semantics so import edges, re-export edges, synthetic containment edges, cached edges, and traversal-facing edge classification are easier to reason about and change.

## Current State

`src/graph/build-graph.ts` is a deep Module, but it currently does many edge-related jobs inline:

- resolver Adapter ordering
- resolver context setup and caches
- graph node normalization
- cached resolved-edge reuse
- import edge creation
- re-export edge creation
- export-all edge creation
- synthetic containment edge expansion
- warning conversion
- diagnostics counters
- deterministic edge sorting

Traversal Modules then depend directly on the detailed `ResolvedEdge` shape:

- `src/graph/traverse-impact.ts` ignores synthetic containment edges and interprets `entities` and `reExports`.
- `src/graph/traverse-containment.ts` walks all forward edges and preserves synthetic edge data for output reasons.
- Cache stores `ResolvedEdge` values directly in `src/cache/cache-types.ts`.

The external graph builder Module earns its keep. The opportunity is inside the Implementation: edge semantics are important enough to deserve better locality.

Key references:

- `src/graph/build-graph.ts`
- `src/graph/traverse-impact.ts`
- `src/graph/traverse-containment.ts`
- `src/cache/cache-types.ts`
- `src/scanner/scanner-types.ts`
- `src/resolvers/resolve-import.ts`
- `tests/graph.test.ts`
- `tests/graph-cached-edges.test.ts`
- `tests/graph-diagnostics.test.ts`
- `tests/impact-containment.test.ts`
- `docs/resolver.md`
- `docs/config.md`

## Target State

Graph edge construction and classification should have a clear internal Module or set of helpers that centralize:

- how raw imports become resolved graph edges
- how re-exports become graph edges
- how export-all edges are represented
- how synthetic containment edges are created and de-duplicated
- how cached edges are normalized before reuse
- how edges are sorted deterministically
- how traversal can tell whether an edge participates in reverse dependency impact, containment, or both

`buildGraph` should still return the same graph shape unless a carefully tested migration is chosen.

## Requirements

- Preserve resolver order from `docs/resolver.md`:
  1. relative paths
  2. TSConfig path aliases
  3. workspace package exports
  4. workspace package names
- Preserve Node.js builtin handling as external.
- Preserve graph output determinism.
- Preserve cached edge reuse behaviour.
- Preserve named entity propagation and re-export behaviour in `traverseImpact`.
- Preserve containment traversal behaviour and synthetic path information.
- Keep `ResolvedEdge` cache compatibility unless an explicit migration is added.
- Add focused tests for moved edge construction/classification behaviour.

## Constraints

- This affects graph analysis performance, so run:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm benchmark`
- Do not broaden resolver behaviour in this task.
- Do not change source scanning behaviour in this task.
- Do not introduce a new seam unless there is more than one real use or it meaningfully improves locality inside the graph Module.
- Keep all paths POSIX-normalized as documented in `docs/resolver.md`.

## Suggested Implementation Notes

Useful internal names to evaluate:

- graph edge factory
- edge normalizer
- edge sorter
- edge classifier
- containment edge expansion

Do not split these mechanically. Prefer a small number of Modules that hide real edge knowledge from the orchestration loop in `buildGraph`.

## Success Conditions

- Edge semantics are easier to locate and test.
- `buildGraph` is shorter or more clearly organized without losing depth.
- Traversal behaviour is unchanged.
- Cached edge behaviour is unchanged.
- Existing graph, resolver, containment, and cache tests pass.
- `pnpm test`, `pnpm lint`, and `pnpm benchmark` complete successfully.
