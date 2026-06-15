import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { resolveImport } from "../src/resolvers/resolve-import.js";
import { tsconfigPathsResolver } from "../src/resolvers/tsconfig-paths-resolver.js";
import { workspacePackageResolver } from "../src/resolvers/workspace-package-resolver.js";

describe("tsconfigPathsResolver", () => {
  it("resolves exact and wildcard tsconfig paths aliases", async () => {
    const fs = createMemoryFileSystem({
      "packages/shared/src/index.ts": "export const shared = true;",
      "packages/shared/src/utils.ts": "export const utils = true;",
      "apps/web/src/index.ts": "export const app = true;"
    });

    const context = {
      fs,
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@shared": ["packages/shared/src/index.ts"],
          "@shared/*": ["packages/shared/src/*"],
          "@app/*": ["apps/web/src/*"]
        }
      }
    };

    await expect(tsconfigPathsResolver.resolve("@shared", "apps/web/src/routes.ts", context)).resolves.toEqual(
      {
        type: "resolved",
        path: "packages/shared/src/index.ts",
        resolver: "tsconfig-paths"
      }
    );

    await expect(tsconfigPathsResolver.resolve("@shared/utils", "apps/web/src/routes.ts", context)).resolves.toEqual(
      {
        type: "resolved",
        path: "packages/shared/src/utils.ts",
        resolver: "tsconfig-paths"
      }
    );

    await expect(tsconfigPathsResolver.resolve("@app/index", "packages/shared/src/index.ts", context)).resolves.toEqual(
      {
        type: "resolved",
        path: "apps/web/src/index.ts",
        resolver: "tsconfig-paths"
      }
    );
  });
});

describe("workspacePackageResolver", () => {
  it("resolves workspace package names to package roots and ignores externals", async () => {
    const context = {
      fs: createMemoryFileSystem(),
      workspacePackages: [
        {
          name: "@acme/ui",
          root: "packages/ui",
          packageJsonPath: "packages/ui/package.json"
        }
      ]
    };

    await expect(workspacePackageResolver.resolve("@acme/ui", "apps/web/src/routes.ts", context)).resolves.toEqual(
      {
        type: "resolved",
        path: "packages/ui",
        resolver: "workspace-package"
      }
    );

    await expect(workspacePackageResolver.resolve("react", "apps/web/src/routes.ts", context)).resolves.toEqual({
      type: "external"
    });
  });
});

describe("resolveImport", () => {
  it("ignores node builtins before running resolvers", async () => {
    const context = { fs: createMemoryFileSystem() };

    await expect(resolveImport("node:path", "src/index.ts", context, [tsconfigPathsResolver, workspacePackageResolver])).resolves.toEqual(
      {
        type: "external"
      }
    );
  });
});
