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

## Task List

### Phase 1: Scaffold and Core Types

### Task 2: Define shared types and filesystem adapters
**Description:** Add the shared types and abstractions that everything else depends on: filesystem interface, config/test-map/cache types, and memory/node filesystem adapters.

**Acceptance criteria:**
- Core code depends on filesystem interfaces, not Node APIs directly.
- Config, manifest, and cache types are defined centrally and reused across modules.
- Tests can exercise loaders and scanners without touching real disk.

**Verification:**
- [ ] Unit tests for filesystem adapters pass
- [ ] TypeScript build succeeds
- [ ] Invalid JSON inputs produce typed validation errors

**Dependencies:** Completed Task 1

**Files likely touched:**
- `src/filesystem/filesystem.ts`
- `src/filesystem/node-filesystem.ts`
- `src/filesystem/memory-filesystem.ts`
- `src/config/config-schema.ts`
- `src/cache/cache-types.ts`
- `src/test-map/load-test-map.ts`

**Estimated scope:** Medium

### Task 3: Implement config and test-map loading
**Description:** Load `.sniffler/config.json` and `.sniffler/test-map.json`, validate required fields, and make error messages actionable for invalid or missing project-owned files.

**Acceptance criteria:**
- Config can be loaded from the default path and an explicit `--config` path.
- Test manifest loads from the configured path and validates required target structure.
- Missing or invalid JSON produces clear failures instead of silent fallback.

**Verification:**
- [ ] Unit tests for config lookup order pass
- [ ] Unit tests for manifest validation pass
- [ ] Manual check against a fixture project succeeds

**Dependencies:** Task 2

**Files likely touched:**
- `src/config/load-config.ts`
- `src/test-map/load-test-map.ts`
- `tests/config.test.ts`
- `tests/test-map.test.ts`

**Estimated scope:** Small

### Checkpoint: After Tasks 1-3
- [ ] Package scaffolding works
- [ ] Config and manifest loading are validated
- [ ] Build, tests, and lint all pass
- [ ] Review the first end-to-end slice before expanding resolution logic

### Phase 2: Scanner, Graph, and Matching

### Task 4: Build the scanner
**Description:** Implement the lightweight text scanner for static `import`, `export`, `require`, and supported dynamic import forms, including warning generation for non-literal dynamic expressions.

**Acceptance criteria:**
- Supported static forms are detected without AST parsing.
- Unsupported dynamic imports and requires emit warnings and no edges.
- Scanner stays pure: no logging, filesystem access, or thrown syntax errors for unsupported syntax.

**Verification:**
- [ ] Unit tests for static imports and exports pass
- [ ] Unit tests for dynamic import warnings pass
- [ ] Scanner output is deterministic for identical input

**Dependencies:** Tasks 1-3

**Files likely touched:**
- `src/scanner/scan-file.ts`
- `src/scanner/scanner-types.ts`
- `tests/scanner.test.ts`

**Estimated scope:** Medium

### Task 5: Implement relative resolution and single-package graph traversal
**Description:** Add relative import resolution and wire scanner output into a graph builder that can compute affected modules for a single-package project.

**Acceptance criteria:**
- `./` and `../` imports resolve correctly.
- A changed file can be traversed through reverse dependencies to impacted modules.
- Reverse traversal preserves shortest paths for reason reporting.

**Verification:**
- [ ] Unit tests for relative resolution pass
- [ ] Graph traversal tests pass on a single-package fixture
- [ ] Impact output for one changed file matches expected affected modules

**Dependencies:** Task 4

**Files likely touched:**
- `src/resolvers/relative-resolver.ts`
- `src/graph/build-graph.ts`
- `src/graph/traverse-impact.ts`
- `tests/graph.test.ts`

**Estimated scope:** Medium

### Task 6: Match tests from the manifest and produce reasons
**Description:** Connect the impacted module set to `.sniffler/test-map.json`, support exact and glob target matching, and return the shortest dependency path reason for each selected test.

**Acceptance criteria:**
- Exact and glob targets both match correctly.
- Each selected test includes the touched target and shortest dependency path.
- Traversal continues after the first match so higher-level modules can select additional tests.

**Verification:**
- [ ] Manifest matching tests pass for exact and glob targets
- [ ] Reason-path tests pass
- [ ] Selected tests are stable and sorted

**Dependencies:** Task 5

**Files likely touched:**
- `src/test-map/match-tests.ts`
- `src/output/text-output.ts`
- `src/output/json-output.ts`
- `tests/test-match.test.ts`

**Estimated scope:** Medium

### Checkpoint: After Tasks 4-6
- [ ] Scanner, graph, and manifest matching work end-to-end
- [ ] Single-package impact selection is correct
- [ ] Output reasons are stable and shortest-path based

### Phase 3: Workspaces and Resolvers

### Task 7: Add workspace discovery
**Description:** Implement workspace discovery for `package.json#workspaces` and `pnpm-workspace.yaml#packages`, with deduplication by root path.

**Acceptance criteria:**
- Both workspace discovery strategies work on fixture repos.
- Duplicate workspace roots are deduped.
- Workspace package metadata includes names, roots, and supporting paths.

**Verification:**
- [ ] Unit tests for each discovery strategy pass
- [ ] Fixture-based integration tests pass for a workspace repo

**Dependencies:** Tasks 2-6

**Files likely touched:**
- `src/workspaces/discover-workspaces.ts`
- `src/workspaces/package-json-workspaces.ts`
- `src/workspaces/pnpm-workspace-yaml.ts`
- `tests/workspaces.test.ts`

**Estimated scope:** Medium

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
- [ ] Workspace discovery works for both supported strategies
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
