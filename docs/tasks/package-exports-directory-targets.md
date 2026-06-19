# Prevent package exports from resolving directories as files

## Current State

`packageExportsResolver` currently uses `fs.exists()` when checking an export target. The memory filesystem reports parent directories as existing, so an export target like `./src` resolves to `packages/ui/src` when `packages/ui/src/index.ts` exists.

That creates graph edges to directories instead of scanned source files. The resolver architecture docs say resolved imports should become exact file-to-file graph edges, because directory paths can make real dependencies invisible to impact traversal.

The failing regression test is:

```sh
pnpm vitest run tests/package-exports.test.ts -t "does not resolve package export targets that only exist as directories"
```

## Desired Change

Package export target probing should be file-aware:

1. Resolve an exact target only when `stat().isFile` is true.
2. Continue supporting extension probing for extensionless export targets.
3. Do not treat existing directories as successful package export resolutions.

Consider reusing the source-file candidate helper if its behavior matches package exports expectations, or extract a small file-only probe shared by resolvers.

## Verification

Run:

```sh
pnpm vitest run tests/package-exports.test.ts
pnpm lint
```
