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

### Task 8: Add tsconfig paths and workspace package resolution
**Description:** Implement `tsconfig.paths` resolution and workspace package-name resolution so package imports resolve across the monorepo graph.

**Acceptance criteria:**
- `compilerOptions.paths` aliases resolve correctly.
- Workspace package names resolve to discovered package roots.
- External packages and Node builtins are ignored, not traversed.

**Verification:**
- [ ] Resolver unit tests pass for alias and workspace-name cases
- [ ] Monorepo fixture impacts resolve across package boundaries

**Dependencies:** Task 7

**Files likely touched:**
- `src/resolvers/tsconfig-paths-resolver.ts`
- `src/resolvers/workspace-package-resolver.ts`
- `src/resolvers/resolve-import.ts`
- `tests/resolvers.test.ts`

**Estimated scope:** Medium

### Task 9: Support `package.json.exports`
**Description:** Add a separate exports resolver for supported `package.json.exports` shapes, including ordered condition matching for import and require contexts.

**Acceptance criteria:**
- String, object, subpath, and condition-object export shapes resolve correctly.
- Condition key order is respected.
- Import and require default condition sets differ as specified.

**Verification:**
- [ ] Exports resolver tests pass for all supported shapes
- [ ] Fixture imports through workspace package exports resolve correctly

**Dependencies:** Task 8

**Files likely touched:**
- `src/resolvers/package-exports-resolver.ts`
- `tests/package-exports.test.ts`

**Estimated scope:** Medium

### Checkpoint: After Tasks 7-9
- [x] Workspace discovery works for both supported strategies
- [ ] Alias, package-name, and exports resolution all work
- [ ] Monorepo fixture resolves impacted E2E tests correctly

### Phase 4: Cache, CLI, and Coverage

### Task 10: Implement cache load, validation, and atomic save
**Description:** Add cache loading, config-hash invalidation, content-hash reuse, and atomic cache writes while treating restored cache as untrusted.

**Acceptance criteria:**
- Cache is reused only when file content hashes still match.
- Config hash changes fully invalidate the cache.
- Cache writes are atomic and never leave a partial file behind.

**Verification:**
- [ ] Cache reuse tests pass
- [ ] Cache invalidation tests pass
- [ ] Atomic-save behavior is covered by tests

**Dependencies:** Tasks 2-9

**Files likely touched:**
- `src/cache/load-cache.ts`
- `src/cache/save-cache.ts`
- `tests/cache.test.ts`

**Estimated scope:** Medium

### Task 11: Finish the CLI and output formats
**Description:** Wire `sniffler impact` end-to-end for `--base/--head` and `--changed`, and finalize stable human-readable text and JSON output.

**Acceptance criteria:**
- `sniffler impact --base ... --head ...` computes changed files from Git.
- `--changed` works for local debugging and non-Git callers.
- Text and JSON output match the spec and remain deterministically ordered.
- No mapped tests exits successfully with an empty recommended-test list.

**Verification:**
- [ ] CLI golden tests pass for text and JSON output
- [ ] Manual check on fixture repos matches the spec examples
- [ ] No-tests fixture exits successfully

**Dependencies:** Tasks 5-10

**Files likely touched:**
- `src/cli.ts`
- `src/create-sniffler.ts`
- `src/output/text-output.ts`
- `src/output/json-output.ts`
- `tests/cli.test.ts`

**Estimated scope:** Medium

### Task 12: Add fixture coverage and release hygiene
**Description:** Build the integration fixture set from the spec, add golden tests for the main flows, and finish documentation and packaging details.

**Acceptance criteria:**
- Fixtures exist for single-package, `package.json` workspaces, pnpm workspaces, tsconfig paths, and package exports.
- Golden tests cover warnings, no-mapped-tests, text output, and JSON output.
- Repo docs reflect the implemented command surface and project layout.

**Verification:**
- [ ] Full test suite passes
- [ ] Build and lint pass
- [ ] Fixture-driven end-to-end flows match the spec

**Dependencies:** Tasks 1-11

**Files likely touched:**
- `tests/fixtures/*`
- `tests/*.test.ts`
- `README.md` or equivalent docs
- `package.json`

**Estimated scope:** Large, but can be split into smaller fixture-specific follow-ups if needed

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Scanner misses edge cases because V1 avoids AST parsing | Medium | Keep supported syntax narrow, add fixture-driven tests, and warn on ambiguous forms |
| Resolver behavior becomes inconsistent across strategies | High | Centralize resolver orchestration and test each resolver in isolation and in one integrated monorepo fixture |
| Cache corruption or stale reuse causes incorrect impacts | High | Validate cache entries aggressively and recompute final selection every run |
| Output drift breaks CI consumers | Medium | Add golden tests for both text and JSON outputs and enforce deterministic sorting |

## Open Questions
- None for now; V1 scope decisions are fixed.
