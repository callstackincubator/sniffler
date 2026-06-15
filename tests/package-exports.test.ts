import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { packageExportsResolver } from "../src/resolvers/package-exports-resolver.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFileText } from "../src/scanner/scan-file.js";

describe("packageExportsResolver", () => {
  it("resolves string package exports for the package root", async () => {
    const fs = createMemoryFileSystem({
      "packages/ui/src/index.ts": "export const ui = true;"
    });

    const context = {
      fs,
      workspacePackages: [
        {
          name: "@acme/ui",
          root: "packages/ui",
          packageJsonPath: "packages/ui/package.json",
          exports: "./src/index.ts"
        }
      ]
    };

    await expect(packageExportsResolver.resolve("@acme/ui", "apps/web/src/routes.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "packages/ui/src/index.ts",
      resolver: "package-exports"
    });
  });

  it("resolves exact, subpath, and wildcard export keys", async () => {
    const fs = createMemoryFileSystem({
      "packages/ui/src/index.ts": "export const ui = true;",
      "packages/ui/src/button.ts": "export const button = true;",
      "packages/ui/src/features/card.ts": "export const card = true;"
    });

    const context = {
      fs,
      workspacePackages: [
        {
          name: "@acme/ui",
          root: "packages/ui",
          packageJsonPath: "packages/ui/package.json",
          exports: {
            ".": "./src/index.ts",
            "./button": "./src/button.ts",
            "./features/*": "./src/features/*"
          }
        }
      ]
    };

    await expect(packageExportsResolver.resolve("@acme/ui", "apps/web/src/routes.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "packages/ui/src/index.ts",
      resolver: "package-exports"
    });

    await expect(packageExportsResolver.resolve("@acme/ui/button", "apps/web/src/routes.ts", context)).resolves.toEqual(
      {
        type: "resolved",
        path: "packages/ui/src/button.ts",
        resolver: "package-exports"
      }
    );

    await expect(
      packageExportsResolver.resolve("@acme/ui/features/card", "apps/web/src/routes.ts", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "packages/ui/src/features/card.ts",
      resolver: "package-exports"
    });
  });

  it("walks condition object keys in declaration order and uses the current import kind", async () => {
    const fs = createMemoryFileSystem({
      "packages/ui/src/index.ts": "export const ui = true;",
      "packages/ui/src/index.cjs": "module.exports = { ui: true };"
    });

    const context = {
      fs,
      workspacePackages: [
        {
          name: "@acme/ui",
          root: "packages/ui",
          packageJsonPath: "packages/ui/package.json",
          exports: {
            ".": {
              require: "./src/index.cjs",
              import: "./src/index.ts",
              default: "./src/index.ts"
            }
          }
        }
      ]
    };

    await expect(
      packageExportsResolver.resolve("@acme/ui", "apps/web/src/routes.ts", {
        ...context,
        importKind: "import"
      })
    ).resolves.toEqual({
      type: "resolved",
      path: "packages/ui/src/index.ts",
      resolver: "package-exports"
    });

    await expect(
      packageExportsResolver.resolve("@acme/ui", "apps/web/src/routes.ts", {
        ...context,
        importKind: "require"
      })
    ).resolves.toEqual({
      type: "resolved",
      path: "packages/ui/src/index.cjs",
      resolver: "package-exports"
    });
  });

  it("returns external for non-workspace package specifiers", async () => {
    const context = {
      fs: createMemoryFileSystem(),
      workspacePackages: []
    };

    await expect(packageExportsResolver.resolve("react", "apps/web/src/routes.ts", context)).resolves.toEqual({
      type: "external"
    });
  });
});

describe("package exports integration", () => {
  it("resolves workspace package exports in the dependency graph", async () => {
    const graph = await buildGraph([
      {
        path: "packages/ui/src/button.ts",
        scan: scanFileText({
          filePath: "packages/ui/src/button.ts",
          text: "export const button = true;"
        })
      },
      {
        path: "apps/web/src/routes.ts",
        scan: scanFileText({
          filePath: "apps/web/src/routes.ts",
          text: 'import "@acme/ui/button";'
        })
      }
    ], {
      resolveContext: {
        fs: createMemoryFileSystem({
          "packages/ui/package.json": JSON.stringify({
            name: "@acme/ui",
            exports: {
              "./button": "./src/button.ts"
            }
          }),
          "packages/ui/src/button.ts": "export const button = true;"
        }),
        workspacePackages: [
          {
            name: "@acme/ui",
            root: "packages/ui",
            packageJsonPath: "packages/ui/package.json",
            exports: {
              "./button": "./src/button.ts"
            }
          }
        ]
      }
    });

    expect(graph.edges).toEqual([
      {
        from: "apps/web/src/routes.ts",
        to: "packages/ui/src/button.ts",
        resolver: "package-exports"
      }
    ]);
  });
});
