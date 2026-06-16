# Resolver Architecture

Sniffler builds its impact graph from import-like relationships between source files. The scanner records raw specifiers such as `../shared/button` or `@components/Button`; the resolver turns those specifiers into normalized project paths that can be stored as graph edges.

The resolver is intentionally lightweight. It does not execute code, run TypeScript, or ask a bundler for answers. Instead, it applies a small set of project-aware strategies that cover the resolution features Sniffler supports in V1.

## Where Resolution Fits

Resolution happens while building the dependency graph:

1. Source files are discovered from `.sniffler/config.json`.
2. Each source file is scanned for imports, requires, dynamic imports with string literals, and re-exports.
3. Every discovered specifier is passed through the resolver chain.
4. Resolved imports become graph edges from the importing file to the imported file.
5. Impact traversal walks those edges in reverse from changed files.

Because traversal depends on exact path matching, resolvers should return the same normalized file paths that source discovery and graph nodes use. Returning a directory, a non-normalized path, or a path outside the scanned source set can make a real dependency invisible to impact analysis.

## Resolver Results

Each resolver attempt produces one of three outcomes:

- `resolved`: Sniffler found a project path and should add an edge.
- `external`: the specifier belongs outside the local graph, usually a package from `node_modules` or a Node.js built-in.
- `unresolved`: this resolver did not handle the specifier, so the next resolver can try.

The resolver chain stops at the first non-`unresolved` result. This keeps the behavior predictable: resolver order matters, and each resolver should only claim specifiers it understands.

## Resolver Chain

Sniffler currently resolves imports in this order:

1. Relative paths
2. TSConfig path aliases
3. Workspace package exports
4. Workspace package names

Node.js built-in modules are treated as external before the chain runs.

### Relative Paths

Relative imports begin with `./` or `../`. They are resolved from the importing file's directory and normalized to POSIX-style paths.

This resolver is deliberately simple. It expects imports to name the file path as Sniffler should store it in the graph.

### TSConfig Path Aliases

TSConfig path aliases come from `compilerOptions.paths` in the configured TSConfig file. The optional `baseUrl` is resolved relative to that TSConfig file.

Aliases may be exact or wildcard patterns. For example, `@components/*` can map `@components/Button` to a candidate such as `src/components/Button`.

Candidate paths must resolve to source files, not just existing filesystem entries. This matters for directory-style modules: if `@components/Button` points at `src/components/Button`, the resolver should connect the graph to the real entry file such as `src/components/Button/index.tsx` instead of the directory path.

Sniffler probes candidate source files in this order:

1. The exact candidate path, but only when it is a file.
2. The candidate with each configured source extension appended.
3. The candidate's `index` file with each configured source extension appended.

The configured source extensions come from `source.extensions` in `.sniffler/config.json`. Sniffler does not broaden the graph to extensions it does not scan.

### Workspace Package Exports

Workspace package exports resolve imports that target a discovered local workspace package with a `package.json#exports` map.

Sniffler supports string exports, exact subpath exports, wildcard subpath exports, and conditional export objects. Conditions are chosen from the Sniffler resolver config, with separate condition lists for `import` and `require`.

Only workspace packages are resolved this way. Third-party packages are external to the graph.

### Workspace Package Names

If a specifier exactly matches the name of a discovered workspace package and no exports map handled it first, Sniffler resolves the import to the package root.

This is a fallback for workspaces that are referenced by package name but do not expose a supported `exports` entry for the specifier.

## Resolver Context

Resolvers receive context collected before graph construction:

- Filesystem access through Sniffler's filesystem abstraction.
- Discovered workspace package metadata.
- Configured source extensions for source-file probing.
- TSConfig paths and base URL.
- Resolver conditions for `import` and `require`.
- The import kind currently being resolved.

Keeping this context explicit makes resolvers testable and lets the CLI, tests, and future integrations use the same resolver behavior without depending on process-global state.

## Path Normalization

Sniffler normalizes paths to POSIX-style separators before storing them. This keeps graph output stable across operating systems and avoids mismatches between scanner output, resolver output, cache entries, and changed-file input.

Contributors should treat path canonicalization as part of resolver correctness. A resolved edge should point to the canonical source file that will also appear as a graph node.

## Limitations

Sniffler resolution is not a full replacement for TypeScript, Node.js, or bundler resolution. It intentionally supports the subset needed for lightweight impact analysis:

- Dynamic imports are only resolved when the specifier is a string literal.
- Third-party package internals are not added to the graph.
- Unsupported package export shapes are ignored or treated as external.
- Framework-specific conventions, such as routes or component registries, are not inferred.

When adding resolver behavior, prefer small project-aware rules that produce stable graph paths over trying to emulate every runtime or bundler edge case.
