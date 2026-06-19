# Prefer the most specific matching TSConfig path pattern

## Current State

`tsconfigPathsResolver` walks compiled `compilerOptions.paths` entries in object declaration order. If a broad pattern appears before a more specific pattern, the broad pattern wins as soon as it resolves to an existing source file.

For example, `@app/components/Button` currently resolves through `@app/*` when `@app/*` appears before `@app/components/*`, even though the second pattern is more specific.

The failing regression test is:

```sh
pnpm vitest run tests/resolvers.test.ts -t "prefers the most specific matching tsconfig path pattern"
```

## Desired Change

When multiple TSConfig path patterns match a specifier, prefer the most specific pattern before probing replacements. A good rule is to sort matching patterns by:

1. Longest literal prefix.
2. Longest literal suffix.
3. Original declaration order as the final tie-breaker.

Within the selected pattern, preserve replacement order and continue falling back to later replacements when earlier targets are missing.

## Verification

Run:

```sh
pnpm vitest run tests/resolvers.test.ts
pnpm lint
```
