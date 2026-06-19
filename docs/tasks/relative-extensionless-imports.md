# Resolve extensionless relative imports to source files

## Current State

`relativeResolver` currently normalizes and joins the raw relative specifier against the importing file directory. For an import like `import "./Button"` from `src/components/App.tsx`, it returns `src/components/Button` even when `src/components/Button.tsx` exists.

That path is not a scanned source file, so graph edges can point at nodes that do not exist in the graph. This also conflicts with the config documentation for `source.extensions`, which says Sniffler uses configured extensions when resolving extensionless imports.

The failing regression test is:

```sh
pnpm vitest run tests/graph.test.ts -t "resolves extensionless relative imports to configured source files"
```

## Desired Change

Resolve relative import candidates through the same source-file probing semantics used by TSConfig paths:

1. Exact candidate path, only if it is a file.
2. Candidate plus each configured source extension.
3. Candidate `/index` plus each configured source extension.

The resolver should still only claim `./` and `../` specifiers. If no source file candidate exists, return an unresolved result instead of manufacturing a path that will not match a graph node.

## Verification

Run:

```sh
pnpm vitest run tests/graph.test.ts
pnpm lint
```
