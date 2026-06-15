# Sniffler

Sniffler is a standalone TypeScript CLI for selecting impacted E2E tests from a set of changed files.

## Commands

```bash
pnpm build
pnpm test
pnpm lint
```

```bash
sniffler impact --base origin/main --head HEAD
sniffler impact --base origin/main --head HEAD --format json
sniffler impact --changed src/components/Button.tsx
```

## Project Layout

- `src/` contains the CLI, core graph logic, resolvers, cache, output, and loaders.
- `tests/` contains unit tests, fixture-backed integration tests, and fixture projects.
- `docs/` contains the living spec and implementation plan.
- `.sniffler/` stores project-owned config, test maps, and the generated cache.
