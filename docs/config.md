# Configuration

Sniffler reads project configuration from `.sniffler/config.json` by default. Pass `--config <path>` to `sniffler impact` or `sniffler run` when the file lives somewhere else.

Config files are JSON only. Sniffler does not execute JavaScript config files, which keeps CI behavior deterministic and lets Sniffler safely hash the normalized config for cache invalidation.

## Getting Started

Create `.sniffler/config.json` in the project root:

```json
{
  "workers": "auto",
  "source": {
    "roots": ["apps", "packages"],
    "ignore": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"]
  },
  "tests": {
    "manifest": ".sniffler/test-map.json",
    "runAllWhenChanged": ["pnpm-lock.yaml"]
  }
}
```

Then run Sniffler from the project root:

```bash
sniffler impact --base origin/main --head HEAD
sniffler run --base origin/main --head HEAD -- pnpm vitest run
```

For React Native projects, pass `--platform <name>` when you want extensionless imports to prefer platform-specific source files at runtime:

```bash
sniffler impact --platform android --base origin/main --head HEAD
sniffler run --platform android --base origin/main --head HEAD -- pnpm vitest run
```

If your config is elsewhere, pass it explicitly:

```bash
sniffler impact --config configs/sniffler.json --base origin/main --head HEAD
sniffler run --config configs/sniffler.json --base origin/main --head HEAD -- pnpm vitest run
```

Every property is optional. Missing properties are filled from the defaults below.

## Default Config

```json
{
  "source": {
    "roots": ["."],
    "extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    "ignore": [],
    "includeNodeModules": false
  },
  "graph": {
    "contains": []
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
    "manifest": ".sniffler/test-map.json",
    "sharedTargets": [],
    "runAllWhenChanged": [],
    "invalidateSubtreeWhenTouched": []
  },
  "cache": {
    "path": ".sniffler/cache.json",
    "stale": "content"
  },
  "output": {
    "format": "text"
  }
}
```

## Config Shape

```ts
type SnifflerConfig = {
  workers?: "auto" | number;
  source?: {
    roots?: string[];
    extensions?: string[];
    ignore?: string[];
    includeNodeModules?: boolean;
  };
  graph?: {
    contains?: Array<{
      from: string;
      to: string;
    }>;
  };
  workspaces?: {
    strategies?: Array<"package-json" | "pnpm-workspace">;
  };
  resolver?: {
    tsconfig?: string;
    conditions?: {
      import?: string[];
      require?: string[];
    };
  };
  tests?: {
    manifest?: string;
    sharedTargets?: string[];
    runAllWhenChanged?: string[];
    invalidateSubtreeWhenTouched?: string[];
  };
  cache?: {
    path?: string;
    stale?: "content" | "metadata";
  };
  output?: {
    format?: "text" | "json";
  };
};
```

The config file may also include a string `$schema` property.

### `workers`

Controls source scanning parallelism for cache misses.

Default:

```json
"auto"
```

Accepted values:

```json
"auto"
```

or any non-negative integer:

```json
0
```

```json
4
```

`0` keeps scanning serial. Any value above `0` enables worker-based scanning when Sniffler chooses the worker path. Worker scanning currently requires the Node file system implementation.

`platform` is intentionally not a config property. It is a runtime option passed to `sniffler impact` or `sniffler run`, so the same project config can be reused for `android`, `ios`, web, or default resolution runs.

## Properties

### `source.roots`

Directories Sniffler scans for source files. Paths are resolved from the current working directory where the CLI runs.

Default:

```json
["."]
```

Set this to the parts of the repo that contain application or package source:

```json
{
  "source": {
    "roots": ["apps/web", "packages"]
  }
}
```

If `source.roots` is empty, Sniffler discovers no source files.

### `source.extensions`

File extensions Sniffler scans and uses when resolving extensionless imports.

Default:

```json
[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
```

Sniffler does not broaden import resolution beyond this list. If your graph should include a source extension, include it here.

```json
{
  "source": {
    "extensions": [".ts", ".tsx"]
  }
}
```

If `source.extensions` is empty, Sniffler discovers no source files.

### `source.ignore`

Glob patterns excluded from source discovery.

Default:

```json
[]
```

Use this to keep test files, generated files, fixtures, or build outputs out of the source graph:

```json
{
  "source": {
    "ignore": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/dist/**"]
  }
}
```

### `source.includeNodeModules`

Whether Sniffler may crawl into and include `node_modules` directories during source discovery.

Default:

```json
false
```

Leave this off for normal projects so dependency trees are never scanned by default. Set it to `true` only when you explicitly want source discovery to include files under `node_modules`:

```json
{
  "source": {
    "includeNodeModules": true
  }
}
```

This setting controls Sniffler's built-in traversal policy. `source.ignore` still applies as a separate project filter.

### `graph.contains`

Synthetic containment edges Sniffler adds on top of the import graph.

Default:

```json
[]
```

Each rule links every source-discovered `from` match to every source-discovered `to` match, after exact and glob expansion. Include router files in `source.roots` before using them in containment rules:

```json
{
  "graph": {
    "contains": [
      { "from": "app/_layout.tsx", "to": "app/**/*.tsx" },
      { "from": "app/(tabs)/_layout.tsx", "to": "app/(tabs)/**/*.tsx" }
    ]
  }
}
```

These synthetic edges are forward-only. They help containment traversal walk into selected subtrees, but reverse dependency traversal still follows real import/export edges only.

### `workspaces.strategies`

Workspace discovery strategies used for local package resolution.

Default:

```json
["package-json", "pnpm-workspace"]
```

Allowed values:

| Value | Meaning |
| --- | --- |
| `"package-json"` | Discover workspaces from the root `package.json` `workspaces` field. |
| `"pnpm-workspace"` | Discover workspaces from `pnpm-workspace.yaml`. |

Set this to a smaller list when only one strategy applies:

```json
{
  "workspaces": {
    "strategies": ["pnpm-workspace"]
  }
}
```

Set it to an empty array to disable workspace package discovery.

### `resolver.tsconfig`

Path to the TSConfig file Sniffler reads for `compilerOptions.paths`.

Default:

```json
"tsconfig.json"
```

The path is resolved from the current working directory. If the file does not exist, is invalid JSON, or does not contain usable `compilerOptions.paths`, Sniffler skips TSConfig path alias resolution.

```json
{
  "resolver": {
    "tsconfig": "apps/web/tsconfig.json"
  }
}
```

### `resolver.conditions.import`

Package export conditions used when resolving ESM imports and re-exports from workspace packages.

Default:

```json
["import", "node", "default"]
```

Use this when workspace packages expose environment-specific entries:

```json
{
  "resolver": {
    "conditions": {
      "import": ["react-native", "import", "default"]
    }
  }
}
```

### `resolver.conditions.require`

Package export conditions used when resolving CommonJS `require` calls from workspace packages.

Default:

```json
["require", "node", "default"]
```

```json
{
  "resolver": {
    "conditions": {
      "require": ["react-native", "require", "default"]
    }
  }
}
```

### `tests.manifest`

Path to the test map Sniffler uses to turn affected source modules into recommended E2E tests.

Default:

```json
".sniffler/test-map.json"
```

The path is resolved from the current working directory. The manifest must exist and contain a JSON array of test entries:

```json
[
  {
    "test": "e2e/checkout.spec.ts",
    "dependsOn": ["apps/web/src/screens/CheckoutScreen.tsx", "packages/checkout/src/**"]
  }
]
```

Each entry maps one E2E test file to the source paths or glob targets it depends on.

Sniffler also auto-converts the legacy object shape (`{ "tests": [...] }`) to this array form the first time it reads the file.

### `tests.sharedTargets`

Extra source targets Sniffler appends to every `dependsOn` entry before it matches the graph.

Default:

```json
[]
```

Use this for global setup files that affect every test through the dependency graph. For example, if `src/global.ts` imports `src/some-other.ts`, set `tests.sharedTargets` to `["src/global.ts"]`. When `src/some-other.ts` changes, Sniffler still analyzes the graph, finds the path from `src/some-other.ts` to `src/global.ts`, and selects every test that shares that setup module.

```json
{
  "tests": {
    "manifest": ".sniffler/test-map.json",
    "sharedTargets": ["src/global.ts"]
  }
}
```

### `tests.runAllWhenChanged`

Paths or globs that force Sniffler to select every test as soon as any changed file matches.

Default:

```json
[]
```

Use this for repo-level files like lockfiles:

```json
{
  "tests": {
    "runAllWhenChanged": ["pnpm-lock.yaml", "package-lock.json"]
  }
}
```

When a changed file matches one of these rules, Sniffler short-circuits before workspace discovery, TSConfig loading, source discovery, scan, graph build, traversal, and cache load/save. It still loads the test map and returns every test with a run-all reason.

### `tests.invalidateSubtreeWhenTouched`

Paths or globs that make Sniffler treat a touched module as a subtree root. After normal reverse dependency traversal finishes, if one of the affected modules matches one of these rules, Sniffler walks forward through the graph from that root and selects tests whose declared targets are reachable from it.

Default:

```json
[]
```

Use this for explicit containment roots like app shells or route containers:

```json
{
  "tests": {
    "invalidateSubtreeWhenTouched": ["src/App.tsx", "src/screens/**/App.tsx"]
  }
}
```

Containment only follows static graph edges. Sniffler does not infer router relationships or other file associations beyond what the import graph already knows.

### `cache.path`

Path where Sniffler stores graph cache data.

Default:

```json
".sniffler/cache.json"
```

Set a custom path when CI or local tooling expects cache files somewhere else:

```json
{
  "cache": {
    "path": ".cache/sniffler/cache.json"
  }
}
```

The cache is invalidated when the normalized config hash or scanner version changes. Cache write failures are ignored so impact selection can still complete.

Use `cache.stale` to choose how Sniffler decides whether cached file entries can be reused.

### `cache.stale`

Strategy Sniffler uses to decide whether a cached file entry is stale.

Default:

```json
"content"
```

Allowed values:

| Value | Meaning |
| --- | --- |
| `"content"` | Hashes file contents before reusing a cache entry. This is the safest default. |
| `"metadata"` | Compares file size and modification time before reusing a cache entry. This can be faster on large repos, but it trusts filesystem metadata. |

Opt into metadata-based stale checks when local speed matters and your filesystem/tooling preserves reliable mtimes:

```json
{
  "cache": {
    "path": ".sniffler/cache.json",
    "stale": "metadata"
  }
}
```

Switching this value invalidates the cache through Sniffler's normalized config hash.

### `output.format`

Default output format for `sniffler impact`.

Default:

```json
"text"
```

Allowed values:

| Value | Meaning |
| --- | --- |
| `"text"` | Human-readable output. |
| `"json"` | Machine-readable JSON output. |

```json
{
  "output": {
    "format": "json"
  }
}
```

You can override this per command with `--format <text|json>`:

```bash
sniffler impact --format json --base origin/main --head HEAD
```

## Complete Example

```json
{
  "$schema": "https://sniffler.dev/schema/config.v1.json",
  "source": {
    "roots": ["apps", "packages", "app"],
    "extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    "ignore": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/dist/**"]
  },
  "graph": {
    "contains": [
      { "from": "app/_layout.tsx", "to": "app/**/*.tsx" }
    ]
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
    "manifest": ".sniffler/test-map.json",
    "sharedTargets": [],
    "runAllWhenChanged": [],
    "invalidateSubtreeWhenTouched": []
  },
  "cache": {
    "path": ".sniffler/cache.json",
    "stale": "content"
  },
  "output": {
    "format": "text"
  }
}
```
