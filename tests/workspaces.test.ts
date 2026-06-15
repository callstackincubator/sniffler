import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { discoverWorkspaces } from "../src/workspaces/discover-workspaces.js";
import { packageJsonWorkspacesStrategy } from "../src/workspaces/package-json-workspaces.js";
import { pnpmWorkspaceStrategy } from "../src/workspaces/pnpm-workspace-yaml.js";

describe("packageJsonWorkspacesStrategy", () => {
  it("discovers workspace packages from package.json workspaces arrays", async () => {
    const fs = createMemoryFileSystem({
      "package.json": JSON.stringify({
        workspaces: ["apps/*", "packages/*"]
      }),
      "apps/web/package.json": JSON.stringify({
        name: "@acme/web"
      }),
      "packages/ui/package.json": JSON.stringify({
        name: "@acme/ui",
        exports: {
          ".": "./src/index.ts"
        }
      }),
      "packages/ui/tsconfig.json": JSON.stringify({
        compilerOptions: {}
      }),
      "packages/not-a-package/README.md": "missing package json"
    });

    await expect(packageJsonWorkspacesStrategy.discover(".", fs)).resolves.toEqual([
      {
        name: "@acme/web",
        root: "apps/web",
        packageJsonPath: "apps/web/package.json"
      },
      {
        name: "@acme/ui",
        root: "packages/ui",
        packageJsonPath: "packages/ui/package.json",
        tsconfigPath: "packages/ui/tsconfig.json",
        exports: {
          ".": "./src/index.ts"
        }
      }
    ]);
  });

  it("discovers workspace packages from package.json workspaces.packages", async () => {
    const fs = createMemoryFileSystem({
      "package.json": JSON.stringify({
        workspaces: {
          packages: ["packages/*"]
        }
      }),
      "packages/core/package.json": JSON.stringify({
        name: "@acme/core"
      })
    });

    await expect(packageJsonWorkspacesStrategy.discover(".", fs)).resolves.toEqual([
      {
        name: "@acme/core",
        root: "packages/core",
        packageJsonPath: "packages/core/package.json"
      }
    ]);
  });
});

describe("pnpmWorkspaceStrategy", () => {
  it("discovers workspace packages from pnpm-workspace.yaml packages", async () => {
    const fs = createMemoryFileSystem({
      "pnpm-workspace.yaml": [
        "packages:",
        "  - 'apps/*'",
        "  - \"packages/**\"",
        "  - '!**/test/**'"
      ].join("\n"),
      "apps/mobile/package.json": JSON.stringify({
        name: "@acme/mobile"
      }),
      "packages/features/checkout/package.json": JSON.stringify({
        name: "@acme/checkout"
      }),
      "packages/features/test/fixture/package.json": JSON.stringify({
        name: "@acme/test-fixture"
      })
    });

    await expect(pnpmWorkspaceStrategy.discover(".", fs)).resolves.toEqual([
      {
        name: "@acme/mobile",
        root: "apps/mobile",
        packageJsonPath: "apps/mobile/package.json"
      },
      {
        name: "@acme/checkout",
        root: "packages/features/checkout",
        packageJsonPath: "packages/features/checkout/package.json"
      }
    ]);
  });

  it("includes the named pnpm workspace root package", async () => {
    const fs = createMemoryFileSystem({
      "package.json": JSON.stringify({
        name: "@acme/root"
      }),
      "pnpm-workspace.yaml": [
        "packages:",
        "  - 'packages/*'"
      ].join("\n"),
      "packages/ui/package.json": JSON.stringify({
        name: "@acme/ui"
      })
    });

    await expect(pnpmWorkspaceStrategy.discover(".", fs)).resolves.toEqual([
      {
        name: "@acme/root",
        root: ".",
        packageJsonPath: "package.json"
      },
      {
        name: "@acme/ui",
        root: "packages/ui",
        packageJsonPath: "packages/ui/package.json"
      }
    ]);
  });
});

describe("discoverWorkspaces", () => {
  it("dedupes workspace packages by root while preserving the first strategy result", async () => {
    const fs = createMemoryFileSystem();

    await expect(
      discoverWorkspaces(".", fs, [
        {
          name: "first",
          discover: async () => [
            {
              name: "@acme/ui",
              root: "packages/ui",
              packageJsonPath: "packages/ui/package.json",
              tsconfigPath: "packages/ui/tsconfig.json"
            }
          ]
        },
        {
          name: "second",
          discover: async () => [
            {
              name: "@acme/ui",
              root: "packages/ui",
              packageJsonPath: "packages/ui/package.json"
            },
            {
              name: "@acme/app",
              root: "apps/app",
              packageJsonPath: "apps/app/package.json"
            }
          ]
        }
      ])
    ).resolves.toEqual([
      {
        name: "@acme/ui",
        root: "packages/ui",
        packageJsonPath: "packages/ui/package.json",
        tsconfigPath: "packages/ui/tsconfig.json"
      },
      {
        name: "@acme/app",
        root: "apps/app",
        packageJsonPath: "apps/app/package.json"
      }
    ]);
  });
});
