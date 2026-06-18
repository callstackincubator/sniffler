<div align="center">

# Sniffler

<img width="256" height="256" alt="" src="https://github.com/user-attachments/assets/7bc6f920-c94a-4412-955f-85a78da9244a" />

### Sniffler sniffs out the E2E tests your changes actually wake up.

[![mit licence][license-badge]][license]
[![npm downloads][npm-downloads-badge]][npm-downloads]
[![Chat][chat-badge]][chat]
[![PRs Welcome][prs-welcome-badge]][prs-welcome]

</div>

Sniffler turns changed source files into the E2E tests they can affect so you can run a smaller, more relevant set in CI or locally without tracing the whole graph by hand.

## Features

- **Impact Selection**: Resolve which E2E tests are affected by changed files across TypeScript and JavaScript projects.

- **Fast Development Workflow**: Use `impact` to inspect the affected tests and `run` to append them to your existing runner command.

- **Workspace Awareness**: Understand package and workspace layouts so impacted tests are found across real-world monorepos.

- **Configurable Cache**: Store graph data in `.sniffler/cache.json` to speed up repeated runs.

- **Type-Safe & Developer-Friendly**: The CLI, graph, cache, and fixture-backed tests are all written in TypeScript so the behavior stays easy to evolve.

- **Works With Your Setup**: Works with Git diffs, explicit file lists, `package.json` workspaces, `pnpm-workspace.yaml`, TSConfig path aliases, and package exports.

## Getting started

Install Sniffler in your project:

```bash
pnpm add -D sniffler
# or
npm install -D sniffler
```

Add Sniffler's project files to your repo:

```text
.sniffler/config.json
.sniffler/test-map.json
```

Then run the CLI from the project root:

```bash
pnpm exec sniffler impact --base origin/main --head HEAD
pnpm exec sniffler run --base origin/main --head HEAD -- pnpm vitest run
```

You can also pass files directly when you are not starting from a Git diff:

```bash
sniffler impact src/components/Button.tsx
sniffler run src/components/Button.tsx -- pnpm vitest run
```

`sniffler run` appends impacted test files to the runner command and exits with the runner's exit code.

## Quick example

```bash
sniffler impact --base origin/main --head HEAD
sniffler run --base origin/main --head HEAD -- pnpm vitest run
```

Use `impact` when you want to inspect the affected set first. Use `run` when you want Sniffler to pass that set directly into your test runner.

## Project compatibility

Sniffler currently supports:

- **Git-based workflows**: Diff-based and explicit file-based impact selection.
- **JavaScript and TypeScript**: Source graphs built from JS/TS files.
- **Monorepos**: Workspace package discovery through `package.json` and `pnpm-workspace.yaml`.
- **TypeScript path aliases**: Resolution through configured TSConfig path mappings.
- **Package exports**: Workspace package exports and package-name imports in supported setups.

## Made with ❤️ at Callstack

`sniffler` is open source and free to use. If it helps your workflow, please star it 🌟. [Callstack][callstack-readme-with-love] is a team of React and React Native engineers, contact us at [hello@callstack.com](mailto:hello@callstack.com) if you need help or just want to say hi.

Like the project? ⚛️ [Join the team](https://callstack.com/careers/?utm_campaign=Senior_RN&utm_source=github&utm_medium=readme) who does amazing stuff for clients and drives React Native Open Source! 🔥

[callstack-readme-with-love]: https://callstack.com/?utm_source=github.com&utm_medium=referral&utm_campaign=sniffler&utm_term=readme-with-love
[license-badge]: https://img.shields.io/npm/l/sniffler?style=for-the-badge
[license]: https://github.com/callstackincubator/sniffler/blob/main/LICENSE
[npm-downloads-badge]: https://img.shields.io/npm/dm/sniffler?style=for-the-badge
[npm-downloads]: https://www.npmjs.com/package/sniffler
[prs-welcome-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge
[prs-welcome]: https://github.com/callstackincubator/sniffler/pulls
[chat-badge]: https://img.shields.io/discord/426714625279524876.svg?style=for-the-badge
[chat]: https://discord.gg/xgGt7KAjxv
