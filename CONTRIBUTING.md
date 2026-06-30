# Contributing to Sniffler

Sniffler is a standalone TypeScript CLI for selecting impacted E2E tests from changed files. The project is intentionally small, but the behavior is precise: scan source files, resolve dependencies, walk impact, and map the result to tests through an explicit manifest.

This guide collects the practical knowledge needed to develop Sniffler without having to rediscover the repo shape every time.

## Local Setup

Use the repo's package manager version and install dependencies:

```bash
pnpm install
```

Build the CLI, run tests, lint, and benchmark with:

```bash
pnpm build
pnpm test
pnpm lint
pnpm benchmark
```

There is also an application benchmark harness:

```bash
pnpm benchmark:app
```

Clean build artifacts with:

```bash
pnpm clean
```

The published CLI entry point is `sniffler`, and the package currently exposes the binary from `dist/cli.js`.

## Project Goals

Sniffler v1 is a generic JavaScript and TypeScript impact selector. It does not infer framework concepts such as routes, screens, or React components. Those concepts must be represented explicitly through the test manifest.

Key product rules:

- Sniffler is published as a standalone npm package named `sniffler`.
- Configuration is JSON-only in V1.
- Project-owned files live in `.sniffler/`.
- `.sniffler/config.json` and `.sniffler/test-map.json` are committed.
- `.sniffler/cache.json` is generated and ignored by git.
- Workspaces are required in V1.
- Supported workspace discovery strategies are `package.json#workspaces` and `pnpm-workspace.yaml#packages`.
- `tsconfig.paths` is supported in V1.
- `package.json.exports` is supported in V1.
- Dynamic imports are supported only when the target is a string literal.
- CLI output supports both human-readable text and machine-readable JSON.
- Sniffler should not fail CI when no mapped tests are found.

## Repository Map

The main implementation areas are:

- `src/cli.ts` for argument parsing, help text, and command dispatch.
- `src/impact/` for changed-file analysis, graph traversal, cache integration, and selection output.
- `src/run/` for running the selected tests through another command.
- `src/config/` for loading and validating `.sniffler/config.json`.
- `src/scanner/` for source scanning.
- `src/resolvers/` for import resolution.
- `src/workspaces/` for workspace discovery.
- `src/graph/` for graph construction and reverse traversal.
- `src/cache/` for cache loading and atomic saving.
- `src/test-map/` for manifest loading and test matching.
- `src/output/` for text and JSON rendering.
- `src/filesystem/` for filesystem abstractions and test doubles.

The tests mirror those seams:

- `tests/cli.test.ts` covers CLI behavior and option parsing.
- `tests/cache.test.ts` covers cache load/save behavior.
- `tests/impact-cache.test.ts` covers cache reuse in impact selection.
- `tests/graph.test.ts`, `tests/resolvers.test.ts`, and `tests/scanner.test.ts` cover core analysis behavior.
- `tests/fixtures-integration.test.ts` and the fixture folders cover repo-shaped scenarios.
- `tests/benchmark.bench.ts` measures impact-selection performance on a synthetic graph.

## Configuration

Sniffler loads configuration from `.sniffler/config.json` by default, or from an explicit `--config <path>` override.

The default config values are:

```json
{
  "source": {
    "roots": ["."],
    "extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    "ignore": []
  },
  "workspaces": {
    "strategies": ["package-json", "pnpm-workspace"]
  },
  "resolver": {
    "tsconfig": "tsconfig.json",
    "conditions": {
      "import": ["import", "node", "default"],
      "require": ["require", "node", "default"]
    }
  },
  "tests": {
    "manifest": ".sniffler/test-map.json"
  },
  "cache": {
    "path": ".sniffler/cache.json"
  },
  "output": {
    "format": "text"
  }
}
```

Config files are JSON only because they need to be hashable and safe to evaluate in CI.

The test map lives at `.sniffler/test-map.json` by default and uses this shape:

```json
[
  {
    "test": "e2e/checkout.spec.ts",
    "dependsOn": [
      "apps/mobile/src/screens/CheckoutScreen.tsx",
      "packages/checkout/src/**"
    ]
  }
]
```

Targets may be exact file paths or glob patterns. When impact traversal reaches a declared dependency, Sniffler selects the matching test and includes the dependency path used to reach it.

## Development Workflow

For a typical change:

1. Identify the subsystem you are touching.
2. Update or add tests near the relevant seam.
3. Keep the behavior aligned with the spec and config defaults.
4. Run the narrowest tests that exercise your change.
5. Run the full test suite before you stop.
6. Run benchmarks if your change may affect scan, parse, resolve, graph, cache, or traversal performance.
7. Update README or this guide when user-visible behavior or developer workflow changes.

Useful commands while iterating:

```bash
pnpm test
pnpm exec vitest run tests/cli.test.ts
pnpm benchmark
pnpm benchmark:app
pnpm lint
pnpm exec sniffler --help
pnpm exec sniffler impact --help
pnpm exec sniffler run --help
```

## Performance-Sensitive Changes

If a change may affect analysis performance, benchmark it before merging. This includes work in:

- scanner logic
- resolver logic
- workspace discovery
- graph construction
- impact traversal
- cache invalidation or reuse

Use `pnpm benchmark` for the synthetic graph benchmark in this repo. If you are specifically checking behavior against the bundled app benchmark, use `pnpm benchmark:app`.

When reporting the change, include the benchmark result and describe whether the change improved or regressed the hot path.

## Fixtures

The fixture sets live in `tests/fixtures/` and model the supported workspace and resolution scenarios:

- `single-package/`
- `package-json-workspaces/`
- `pnpm-workspace/`
- `tsconfig-paths/`
- `package-exports/`
- `workspace-package-import/`

Use fixtures when you need to verify real project layouts instead of synthetic unit data. They are especially useful for resolver, workspace, and integration coverage.

## Implementation Notes

Keep these details in mind when changing behavior:

- Normalize stored paths to POSIX-style separators.
- Resolver order matters.
- The scanner only records string-literal dynamic imports.
- Cache entries are an optimization, not a source of truth.
- Changing the config or scanner version should invalidate cache reuse when hashes or versions no longer match.
- `run` appends impacted tests to the supplied runner command and exits with that command's exit code.
- `impact` should remain useful both from Git diffs and from direct file lists.

### Source Scanning

The scanner is intentionally lightweight. It is not a full parser or a typechecker. It recognizes the import-like relationships needed for impact analysis and keeps the graph stable and testable.

### Resolution

The resolver chain handles relative paths first, then TSConfig path aliases, then workspace package exports, and finally workspace package names. Unsupported imports should be treated as external or unresolved rather than guessed.

### Graph and Cache

The graph is built from resolved file-to-file edges. Cache data stores scan results and is keyed by content hash and config hash, with scanner version checks for compatibility. Saving the cache should remain atomic.

### Output

Text output is meant for humans. JSON output is meant for automation and should remain stable enough for CI consumption.

## Troubleshooting

If Sniffler cannot find configuration:

- Check `.sniffler/config.json`.
- Pass `--config <path>` if the config lives elsewhere.

If tests are not being selected:

- Check `.sniffler/test-map.json`.
- Make sure the changed file is inside the configured source roots.
- Make sure TSConfig paths and workspace settings match the repo layout.

If imports are not resolving:

- Check the resolver config and source extensions.
- Confirm workspace discovery is finding the packages you expect.
- Confirm the specifier points to a file Sniffler actually scans.

If benchmark numbers change unexpectedly:

- Re-run `pnpm benchmark`.
- Compare the changed subsystem with the synthetic benchmark scenario.
- Confirm the change was not just a fixture or environment difference.

## Documentation Ownership

User-facing behavior belongs in README.md. Development knowledge belongs here. When a change affects both, update both files together so contributors and users stay in sync.
