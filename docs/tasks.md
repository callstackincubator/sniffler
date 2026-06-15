# Implementation Plan: Sniffler E2E Impact Selector

## Overview
Build `sniffler` as a standalone pnpm-based npm package that helps JavaScript and TypeScript projects choose which E2E tests to run for a PR. The V1 implementation will use a lightweight scanner, dependency injection, workspace discovery for `package.json#workspaces` and `pnpm-workspace.yaml#packages`, resolver chaining, reverse dependency traversal, manifest-based test selection, stable human-readable/JSON output, and an untrusted optional cache.

## Architecture Decisions
- Use `vitest` for unit, integration, and CLI golden tests.
- Use `pnpm` for repository package management and workspace handling during development.
- Do not add `sniffler init` in V1; project-owned files are created manually.
- Do not add Yarn-specific workspace behavior beyond standard `package.json#workspaces`.
- Ignore schema URL publication details for now; schema validation can remain local and internal in V1.
- Keep the core pure and dependency-injected; production filesystem access stays behind adapters.
- Keep the scanner lightweight and text-based; no AST parser in V1.
- Treat cache as an optimization only, validate it on every run, and invalidate it on config hash changes.

## Completed

### Task 1: Create the package scaffold
The repository is now a pnpm-managed TypeScript package with `vitest`, lint/build scripts, CLI entrypoint wiring, and the expected directory structure.

Verification completed:
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `sniffler --help`

### Task 2: Define shared types and filesystem adapters
The shared filesystem abstractions, config/test-map scaffolding, and Node/memory filesystem adapters are in place.

Verification completed:
- [x] Unit tests for filesystem adapters pass
- [x] TypeScript build succeeds
- [x] Invalid JSON inputs produce typed validation errors

### Task 3: Implement config and test-map loading
The config and manifest loaders now validate required fields, support the documented default and explicit paths, and return actionable errors for missing or malformed project-owned files.

Verification completed:
- [x] Unit tests for config lookup order pass
- [x] Unit tests for manifest validation pass
- [x] Manual check against a fixture project succeeds

### Task 4: Build the scanner
The lightweight text scanner now detects static `import`, `export`, `require`, and literal dynamic import forms, and it emits warnings for non-literal dynamic expressions without throwing on unsupported syntax.

Verification completed:
- [x] Unit tests for static imports and exports pass
- [x] Unit tests for dynamic import warnings pass
- [x] Scanner output is deterministic for identical input
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`

### Task 5: Implement relative resolution and single-package graph traversal
Relative imports now normalize through the relative resolver, graph construction emits forward edges from scanner output, and reverse impact traversal walks those edges breadth-first while preserving shortest dependency paths for reasons.

Verification completed:
- [x] Unit tests for relative resolution pass
- [x] Graph traversal tests pass on a single-package fixture
- [x] Impact output for one changed file matches expected affected modules
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`

### Task 6: Match tests from the manifest and produce reasons
The manifest matcher now connects impacted modules to `.sniffler/test-map.json`, supports exact and glob target matching, and returns stable reasons with the shortest dependency path for each selected test.

Verification completed:
- [x] Manifest matching tests pass for exact and glob targets
- [x] Reason-path tests pass
- [x] Selected tests are stable and sorted
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`

### Task 7: Add workspace discovery
Workspace discovery now supports `package.json#workspaces` array and object forms, `pnpm-workspace.yaml#packages` glob lists with basic exclusions, named pnpm root packages, package metadata loading, deterministic sorting, and orchestration-level deduplication by root path.

Verification completed:
- [x] Unit tests for each discovery strategy pass
- [x] Fixture-style integration coverage passes for workspace package metadata
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`

### Task 8: Add tsconfig paths and workspace package resolution
`tsconfig.paths` resolution and workspace package-name resolution now resolve package imports across the monorepo graph, while external packages and Node builtins stay out of the graph.

Verification completed:
- [x] Resolver unit tests pass for alias and workspace-name cases
- [x] Monorepo fixture impacts resolve across package boundaries
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`

### Task 9: Support `package.json.exports`
The package exports resolver now handles supported `package.json.exports` shapes, ordered condition matching, and workspace package export resolution across the graph.

Verification completed:
- [x] Exports resolver tests pass for string, object, subpath, wildcard, and condition-object shapes
- [x] Fixture imports through workspace package exports resolve correctly
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`

### Task 10: Implement cache load, validation, and atomic save
The cache loader now validates untrusted restored data, respects config-hash and scanner-version mismatches, and the saver writes via a temporary file before renaming into place.

Verification completed:
- [x] Cache load and config-hash invalidation tests pass
- [x] Atomic-save behavior is covered by tests
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`

### Task 11: Finish the CLI and output formats
The `sniffler impact` command now runs end-to-end for `--base/--head` and `--changed`, and text/JSON output is rendered deterministically from the selected impact result.

Verification completed:
- [x] CLI tests pass for text output, JSON output, and the no-mapped-tests case
- [x] The top-level factory exposes the impact API
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm lint`
- [x] Built CLI smoke test: `node dist/cli.js impact --help`

### Task 12: Add fixture coverage and release hygiene
The fixture set now covers the single-package, `package.json` workspaces, pnpm workspaces, tsconfig paths, package exports, and workspace package import flows from the spec. Fixture-backed integration tests exercise warnings, no-mapped-tests, text output, and JSON output, and the repo now includes top-level usage docs plus fixture documentation.

Verification completed:
- [x] Full test suite passes
- [x] Build and lint pass
- [x] Fixture-driven end-to-end flows match the spec

## Task List

### Phase 1: Scaffold and Core Types

### Checkpoint: After Tasks 1-3
- [x] Package scaffolding works
- [x] Config and manifest loading are validated
- [x] Build, tests, and lint all pass
- [x] Review the first end-to-end slice before expanding resolution logic

### Phase 2: Scanner, Graph, and Matching

### Checkpoint: After Tasks 4-6
- [x] Scanner, graph, and manifest matching work end-to-end
- [x] Single-package impact selection is correct
- [x] Output reasons are stable and shortest-path based

### Phase 3: Workspaces and Resolvers

### Checkpoint: After Tasks 7-9
- [x] Workspace discovery works for both supported strategies
- [x] Alias and package-name resolution work
- [x] Exports resolution works for supported package export shapes
- [x] Monorepo fixture resolves impacted E2E tests correctly

### Phase 4: Cache, CLI, and Coverage

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Scanner misses edge cases because V1 avoids AST parsing | Medium | Keep supported syntax narrow, add fixture-driven tests, and warn on ambiguous forms |
| Resolver behavior becomes inconsistent across strategies | High | Centralize resolver orchestration and test each resolver in isolation and in one integrated monorepo fixture |
| Cache corruption or stale reuse causes incorrect impacts | High | Validate cache entries aggressively and recompute final selection every run |
| Output drift breaks CI consumers | Medium | Add golden tests for both text and JSON outputs and enforce deterministic sorting |

## Open Questions
- None for now; V1 scope decisions are fixed.
