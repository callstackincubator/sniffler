# Configuration

Sniffler reads project configuration from `.sniffler/config.json` by default. Pass `--config <path>` to `sniffler impact` or `sniffler run` when the file lives somewhere else.

Config files are JSON only. Sniffler does not execute JavaScript config files, which keeps CI behavior deterministic and lets Sniffler safely hash the normalized config for cache invalidation.

## Getting Started

Create `.sniffler/config.json` in the project root:

```json
{
  "source": {
    "roots": ["apps", "packages"],
    "ignore": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"]
  },
  "tests": {
    "manifest": ".sniffler/test-map.json"
  }
}
```

Then run Sniffler from the project root:

```bash
sniffler impact --base origin/main --head HEAD
sniffler run --base origin/main --head HEAD -- pnpm vitest run
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

## Config Shape

```ts
type SnifflerConfig = {
  source?: {
    roots?: string[];
    extensions?: string[];
    ignore?: string[];
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
  };
  cache?: {
    path?: string;
  };
  output?: {
    format?: "text" | "json";
  };
};
```

The config file may also include a string `$schema` property.

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

The path is resolved from the current working directory. The manifest must exist and contain a `tests` array:

```json
{
  "tests": [
    {
      "test": "e2e/checkout.spec.ts",
      "targets": ["apps/web/src/screens/CheckoutScreen.tsx", "packages/checkout/src/**"]
    }
  ]
}
```

Each entry maps one E2E test file to the source paths or glob targets it covers.

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
    "roots": ["apps", "packages"],
    "extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    "ignore": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/dist/**"]
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
