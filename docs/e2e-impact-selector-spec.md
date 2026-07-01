# Spec: Sniffler E2E Impact Selector

## Objective

Build `sniffler`, a standalone npm package that helps JavaScript and TypeScript projects choose which E2E tests to run for a PR.

Given a set of changed files, Sniffler builds a lightweight project dependency graph, walks reverse dependencies from the changed files, and selects E2E tests whose declared targets are touched by that traversal. The goal is to avoid manual guessing while avoiding full-suite E2E runs when a smaller impacted set is enough.

Primary users:

- Engineers preparing or reviewing PRs.
- CI pipelines deciding which E2E tests to run.

V1 is generic JS/TS only. It does not understand framework concepts such as routes, screens, pages, or React components. Those concepts are represented explicitly through the test manifest.

## Assumptions

1. Sniffler is published as a standalone npm package named `sniffler`.
2. Configuration is JSON-only in V1.
3. Project-owned Sniffler files live in `.sniffler/`.
4. `.sniffler/config.json` and `.sniffler/test-map.json` are committed.
5. `.sniffler/cache.json` is generated and ignored by git.
6. Workspaces are required in V1.
7. Supported workspace discovery strategies are `package.json#workspaces` and `pnpm-workspace.yaml#packages`.
8. `tsconfig.paths` is supported in V1.
9. `package.json.exports` is supported in V1.
10. Dynamic imports are supported only when their target is statically resolvable as a string literal.
11. CLI supports human-readable text output and machine-readable JSON output.
12. Sniffler does not fail CI when no mapped tests are found.

## Tech Stack

- Runtime: Node.js.
- Language: TypeScript.
- Package format: npm CLI package.
- Parser approach: lightweight scanner, not AST.
- Config format: JSON.
- Cache format: JSON.
- Workspace metadata:
  - `package.json#workspaces`
  - `pnpm-workspace.yaml#packages`
- Resolution metadata:
  - relative imports
  - `tsconfig.paths`
  - workspace package names
  - `package.json.exports`

## Commands

Expected project commands:

```bash
npm run build
npm test -- --coverage
npm run lint
```

Expected CLI commands:

```bash
sniffler impact --base origin/main --head HEAD
sniffler impact --base origin/main --head HEAD --format json
sniffler impact src/components/Button.tsx
sniffler impact src/components/Button.tsx --config .sniffler/config.json
```

`--base/--head` is the primary CI input. Positional changed files exist for local debugging, non-Git callers, and focused tests.

## Project Structure

```text
.sniffler/
  config.json        -> main project config, committed
  test-map.json      -> E2E target manifest, committed
  cache.json         -> generated graph cache, ignored

src/
  cli.ts                         -> CLI argument parsing and process exit
  create-sniffler.ts             -> top-level factory
  config/
    load-config.ts               -> config loading and validation
    config-schema.ts             -> config types and schema
  filesystem/
    filesystem.ts                -> filesystem abstraction type
    node-filesystem.ts           -> production filesystem adapter
    memory-filesystem.ts         -> test filesystem adapter
  scanner/
    scan-file.ts                 -> import/export/require scanner
    scanner-types.ts             -> scanner result and warnings
  workspaces/
    discover-workspaces.ts       -> strategy orchestration
    package-json-workspaces.ts   -> package.json workspaces strategy
    pnpm-workspace-yaml.ts       -> pnpm workspace strategy
  resolvers/
    resolve-import.ts            -> resolver chain orchestration
    relative-resolver.ts         -> relative path resolver
    tsconfig-paths-resolver.ts   -> tsconfig paths resolver
    workspace-package-resolver.ts -> workspace package name lookup
    package-exports-resolver.ts  -> package.json exports resolver
  graph/
    build-graph.ts               -> dependency graph construction
    traverse-impact.ts           -> reverse dependency traversal
  cache/
    load-cache.ts                -> cache loading
    save-cache.ts                -> atomic cache save
    cache-types.ts               -> cache types
  test-map/
    load-test-map.ts             -> manifest loading and validation
    match-tests.ts               -> target matching and reason generation
  output/
    text-output.ts               -> human-readable output
    json-output.ts               -> machine-readable output

tests/
  fixtures/                      -> fixture projects
  *.test.ts                      -> unit and integration tests

docs/
  e2e-impact-selector-spec.md    -> living spec
```

## Configuration

Default config path:

```text
.sniffler/config.json
```

Example:

```json
{
  "$schema": "https://sniffler.dev/schema/config.v1.json",
  "source": {
    "roots": ["apps", "packages"],
    "extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    "ignore": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"]
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

Default lookup order:

1. `.sniffler/config.json`
2. explicit `--config <path>`

V1 does not support JavaScript config files because config must be safely hashable and must not execute code in CI.

## Test Manifest

Default manifest path:

```text
.sniffler/test-map.json
```

Example:

```json
[
  {
    "test": "e2e/checkout.spec.ts",
    "dependsOn": [
      "apps/mobile/src/screens/CheckoutScreen.tsx",
      "packages/checkout/src/**"
    ]
  },
  {
    "test": "e2e/profile.spec.ts",
    "dependsOn": ["apps/mobile/src/screens/ProfileScreen.tsx"]
  }
]
```

Target matching supports:

- Exact normalized project-relative file paths.
- Glob patterns.

When reverse dependency traversal visits a module listed as a target, Sniffler adds the related test to the required test list. The result includes a reason showing which declared target was touched and the shortest dependency path from changed file to target.

Example result:

```json
{
  "test": "e2e/checkout.spec.ts",
  "reason": {
    "changedFile": "packages/ui/src/Button.tsx",
    "declaredTarget": "apps/mobile/src/screens/CheckoutScreen.tsx",
    "dependencyPath": [
      "packages/ui/src/Button.tsx",
      "apps/mobile/src/components/CheckoutForm.tsx",
      "apps/mobile/src/screens/CheckoutScreen.tsx"
    ]
  }
}
```

Only the shortest dependency path is required in V1.

## Architecture

Sniffler uses a pure core with dependency injection. Production IO is isolated behind adapters. Tests use mock or memory adapters.

Main pipeline:

```text
config -> workspace discovery -> file discovery -> scan -> resolve -> graph -> impact -> test map -> output
```

### Dependency Injection

Core modules do not read from `fs` directly. They receive dependencies through factory functions or explicit function parameters.

```ts
export type SnifflerDeps = {
  fs: FileSystem;
  logger: Logger;
  hasher: Hasher;
  clock?: Clock;
};

export const createSniffler = (deps: SnifflerDeps): Sniffler => {
  return {
    impact: createImpactCommand(deps)
  };
};
```

### Filesystem Abstraction

```ts
export type FileSystem = {
  readFile: (path: string) => Promise<string>;
  readJson: <T>(path: string) => Promise<T>;
  exists: (path: string) => Promise<boolean>;
  glob: (patterns: string[], options: GlobOptions) => Promise<string[]>;
  stat: (path: string) => Promise<FileStat>;
  writeFile: (path: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
};
```

Production code may implement this with Node APIs inside `node-filesystem.ts`. Core code must depend only on `FileSystem`.

### Coding Style

Use types and const functions. Do not use classes. Prefer factory methods for composition.

```ts
export type ScanResult = {
  imports: RawImport[];
  warnings: ScanWarning[];
};

export const scanFileText = (input: ScanInput): ScanResult => {
  const imports = collectImports(input.text);
  const warnings = collectScanWarnings(input.text);

  return { imports, warnings };
};
```

Use discriminated unions for result states.

```ts
export type ResolveResult =
  | { type: "resolved"; path: string; resolver: string }
  | { type: "external" }
  | { type: "unresolved"; warning: ResolveWarning };
```

## Scanner

Scanner receives text and returns structured results. It does not log, print, read files, or throw for unsupported syntax.

Supported static forms:

```ts
import value from "./module";
import { value } from "./module";
import type { Value } from "./module";
export { value } from "./module";
export * from "./module";
const value = require("./module");
await import("./module");
```

Dynamic imports:

- `import("./module")` creates an import edge.
- `import(`./module`)` may create an import edge if the template has no expressions.
- `import(`./${name}`)` returns a warning and creates no edge.
- `import(path)` returns a warning and creates no edge.
- `require("./module")` creates an import edge.
- `require(path)` returns a warning and creates no edge.

Scanner output:

```ts
export type RawImport = {
  specifier: string;
  kind: "import" | "export" | "require" | "dynamic-import";
  loc?: SourceLocation;
};

export type ScanWarning = {
  type: "unresolved-dynamic-import" | "unresolved-dynamic-require";
  message: string;
  loc?: SourceLocation;
};

export type ScanResult = {
  imports: RawImport[];
  warnings: ScanWarning[];
};
```

## Resolver

Resolvers are composed as strategies. Each resolver attempts one kind of resolution and returns a typed result.

```ts
export type Resolver = {
  name: string;
  resolve: (
    specifier: string,
    fromFile: string,
    context: ResolveContext
  ) => Promise<ResolveResult>;
};
```

Required resolvers:

1. `relative-resolver.ts`
2. `tsconfig-paths-resolver.ts`
3. `workspace-package-resolver.ts`
4. `package-exports-resolver.ts`

Relative resolver handles `./` and `../`.

TSConfig paths resolver handles aliases from `compilerOptions.paths`.

Workspace package resolver maps package names to discovered workspace package roots.

Package exports resolver applies `package.json.exports` for workspace packages. It must live in a separate file from the TSConfig paths resolver.

Supported `package.json.exports` shapes:

```json
{
  "exports": "./src/index.ts"
}
```

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./button": "./src/button.ts",
    "./features/*": "./src/features/*"
  }
}
```

```json
{
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "require": "./src/index.cjs",
      "default": "./src/index.ts"
    }
  }
}
```

Condition handling:

- For ESM imports and exports, supported conditions default to `["import", "node", "default"]`.
- For CommonJS `require`, supported conditions default to `["require", "node", "default"]`.
- Condition object key order matters. Resolver must walk declared keys in order and pick the first key allowed by the current condition set.

External packages are ignored. Node builtins are ignored.

## Workspace Discovery

Workspace discovery uses strategies. Each strategy returns workspace packages or an empty list.

```ts
export type WorkspaceStrategy = {
  name: string;
  discover: (root: string, fs: FileSystem) => Promise<WorkspacePackage[]>;
};

export type WorkspacePackage = {
  name: string;
  root: string;
  packageJsonPath: string;
  tsconfigPath?: string;
  exports?: unknown;
};
```

Required strategies:

- `package-json-workspaces.ts`
- `pnpm-workspace-yaml.ts`

Strategy orchestration must dedupe packages by root path.

## Graph And Impact Traversal

Graph edge direction:

```text
importer -> imported
```

Reverse graph direction:

```text
imported -> importer
```

Impact traversal starts from changed files and walks the reverse graph breadth-first. BFS gives the shortest dependency path for reasons.

Changed files are included as affected modules. Traversal continues after a manifest target is found because higher-level modules may match additional tests.

## Cache

Cache path:

```text
.sniffler/cache.json
```

Cache is an optimization only. Restored cache must be treated as untrusted and validated before use.

Whole cache is invalidated when config hash changes.

Cache entry:

```ts
export type CacheEntry = {
  path: string;
  contentHash: string;
  scan: ScanResult;
  resolvedEdges: ResolvedEdge[];
};
```

Cache file:

```ts
export type GraphCache = {
  version: 1;
  configHash: string;
  scannerVersion: string;
  files: Record<string, CacheEntry>;
};
```

Run flow:

1. Load cache from `.sniffler/cache.json` if it exists.
2. Compute config hash.
3. If config hash changed, discard cache.
4. Discover source files.
5. Hash file contents.
6. Reuse cache entries only when content hash matches.
7. Rescan and resolve changed or missing entries.
8. Rebuild graph in memory from cached and fresh entries.
9. Traverse impact fresh every run.
10. Save cache atomically.

Do not cache final affected modules or selected tests. Those are cheap and depend on each command input.

## GitHub Actions Cache

GitHub Actions should restore `.sniffler/cache.json` before running Sniffler and save it after successful runs.

Example:

```yaml
- uses: actions/cache/restore@v5
  id: sniffler-cache
  with:
    path: .sniffler/cache.json
    key: sniffler-${{ runner.os }}-${{ hashFiles('.sniffler/config.json', '.sniffler/test-map.json', 'tsconfig*.json', 'package-lock.json') }}-${{ github.sha }}
    restore-keys: |
      sniffler-${{ runner.os }}-${{ hashFiles('.sniffler/config.json', '.sniffler/test-map.json', 'tsconfig*.json', 'package-lock.json') }}-
      sniffler-${{ runner.os }}-

- run: npx sniffler impact --base origin/main --head HEAD --format json

- uses: actions/cache/save@v5
  if: success()
  with:
    path: .sniffler/cache.json
    key: ${{ steps.sniffler-cache.outputs.cache-primary-key }}
```

PR-created caches may be scoped to the PR merge ref. Sniffler must remain correct when cache is missing, stale, or restored from a base branch.

## Output

Text output is optimized for humans:

```text
 ✓ e2e/checkout.spec.ts
   depends on affected apps/mobile/src/screens/CheckoutScreen.tsx

     Impact 1 test selected
    Changed 1 file
   Affected 3 modules
   Warnings 1 warning
 Run with --diagnostics to inspect warning details.
```

JSON output is optimized for CI:

```json
{
  "changedFiles": ["packages/ui/src/Button.tsx"],
  "affectedModules": [
    "packages/ui/src/Button.tsx",
    "apps/mobile/src/components/CheckoutForm.tsx",
    "apps/mobile/src/screens/CheckoutScreen.tsx"
  ],
  "recommendedTests": [
    {
      "test": "e2e/checkout.spec.ts",
      "reasons": [
        {
          "changedFile": "packages/ui/src/Button.tsx",
          "declaredTarget": "apps/mobile/src/screens/CheckoutScreen.tsx",
          "dependencyPath": [
            "packages/ui/src/Button.tsx",
            "apps/mobile/src/components/CheckoutForm.tsx",
            "apps/mobile/src/screens/CheckoutScreen.tsx"
          ]
        }
      ]
    }
  ],
  "warnings": []
}
```

## Testing Strategy

Unit tests:

- Scanner static imports.
- Scanner dynamic import warnings.
- Relative resolver.
- TSConfig paths resolver.
- Package exports resolver.
- Workspace discovery strategies.
- Reverse graph traversal.
- Manifest exact matching.
- Manifest glob matching.
- Cache reuse and invalidation.

Integration tests:

- Single package fixture.
- `package.json#workspaces` fixture.
- `pnpm-workspace.yaml` fixture.
- Workspace package import fixture.
- Package exports fixture.
- TSConfig paths fixture.

CLI golden tests:

- Text output.
- JSON output.
- No mapped tests found.
- Dynamic import warning.

## Boundaries

Always:

- Use dependency injection.
- Use filesystem abstraction in core code.
- Use types and const functions over interfaces.
- Use factory functions over classes.
- Keep scanner pure.
- Return warnings as data.
- Preserve deterministic sorted output.
- Treat cache as optional and untrusted.
- Validate config and manifest.
- Ignore external packages and Node builtins.

Ask first:

- Adding AST parser dependency.
- Adding JavaScript config support.
- Adding framework-specific route or screen inference.
- Changing CI behavior to fail on no mapped tests.
- Adding persistent daemon/watch mode.

Never:

- Guess computed dynamic imports.
- Traverse `node_modules`.
- Execute project config code.
- Log directly from scanner or resolver core.
- Read files directly from core modules.
- Use classes for core architecture.
- Commit `.sniffler/cache.json`.

## Success Criteria

- CLI can compute changed files from `--base/--head`.
- CLI can accept explicit changed files as positional arguments.
- Scanner extracts supported JS/TS import forms without AST.
- Scanner returns warnings for non-literal dynamic imports and requires.
- Resolver handles relative imports.
- Resolver handles `tsconfig.paths`.
- Resolver handles workspace package imports.
- Resolver handles supported `package.json.exports` forms.
- Workspace discovery supports `package.json#workspaces`.
- Workspace discovery supports `pnpm-workspace.yaml#packages`.
- Reverse graph traversal finds all modules affected by changed files.
- Manifest matching selects tests by exact target and glob target.
- Each selected test includes shortest reason path.
- Cache reuses unchanged parsed files.
- Cache invalidates fully on config hash change.
- Text and JSON outputs are stable.
- No mapped tests exits successfully with empty recommended test list.

## Open Questions

1. Which test runner should this package use: Vitest, Jest, or Node test runner?
2. Which package manager should develop Sniffler itself: npm, pnpm, or yarn?
3. Should V1 support `yarn workspaces` only through `package.json#workspaces`, or are Yarn-specific workspace features needed?
4. Should config schema files be published at `https://sniffler.dev/schema/...`, bundled locally only, or both?
5. Should CLI include `sniffler init` in V1 to create `.sniffler/config.json` and `.sniffler/test-map.json`?
