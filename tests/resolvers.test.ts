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

  it("prefers exact files over directory indexes and respects configured source extensions", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.tsx": "export const Button = true;",
      "src/components/Button/index.ts": "export const Button = true;",
      "src/components/Button/index.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      sourceExtensions: [".ts", ".tsx"],
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@components/*": ["src/components/*"]
        }
      }
    };

    await expect(
      tsconfigPathsResolver.resolve("@components/Button", "src/app.ts", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.tsx",
      resolver: "tsconfig-paths"
    });
  });

  it("falls back to an index file when the alias target is a directory", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button/index.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@components/*": ["src/components/*"]
        }
      }
    };

    await expect(tsconfigPathsResolver.resolve("@components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button/index.tsx",
      resolver: "tsconfig-paths"
    });
  });

  it("reports absolute tsconfig alias targets as relative paths", async () => {
    const fs = createMemoryFileSystem({
      "/repo/src/components/TextInput/index.tsx": "export const TextInput = true;"
    });

    const context = {
      fs,
      tsconfigPaths: {
        baseUrl: "/repo",
        paths: {
          "@components/*": ["src/components/*"]
        }
      }
    };

    await expect(
      tsconfigPathsResolver.resolve("@components/TextInput", "/repo/src/pages/Onboarding.tsx", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "src/components/TextInput/index.tsx",
      resolver: "tsconfig-paths"
    });
  });

  it("prefers the first configured extension when probing directory indexes", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button/index.ts": "export const Button = true;",
      "src/components/Button/index.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      sourceExtensions: [".ts", ".tsx"],
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@components/*": ["src/components/*"]
        }
      }
    };

    await expect(
      tsconfigPathsResolver.resolve("@components/Button", "src/app.ts", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button/index.ts",
      resolver: "tsconfig-paths"
    });
  });

  it("falls back to later replacements when an earlier tsconfig path target is missing", async () => {
    const fs = createMemoryFileSystem({
      "src/fallback/Button.ts": "export const Button = true;"
    });

    const context = {
      fs,
      sourceExtensions: [".ts"],
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@components/*": ["src/missing/*", "src/fallback/*"]
        }
      }
    };

    await expect(
      tsconfigPathsResolver.resolve("@components/Button", "src/app.ts", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "src/fallback/Button.ts",
      resolver: "tsconfig-paths"
    });
  });

  it("prefers the most specific matching tsconfig path pattern", async () => {
    const fs = createMemoryFileSystem({
      "src/broad/components/Button.ts": "export const BroadButton = true;",
      "src/specific/Button.ts": "export const SpecificButton = true;"
    });

    const context = {
      fs,
      sourceExtensions: [".ts"],
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@app/*": ["src/broad/*"],
          "@app/components/*": ["src/specific/*"]
        }
      }
    };

    await expect(
      tsconfigPathsResolver.resolve("@app/components/Button", "src/app.ts", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "src/specific/Button.ts",
      resolver: "tsconfig-paths"
    });
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

  it("continues after unresolved resolvers and stops at the first resolved result", async () => {
    const calls: string[] = [];
    const context = { fs: createMemoryFileSystem() };
    const firstResolver = {
      name: "first",
      resolve: async () => {
        calls.push("first");
        return { type: "unresolved" as const, warning: "not handled" };
      }
    };
    const secondResolver = {
      name: "second",
      resolve: async () => {
        calls.push("second");
        return { type: "resolved" as const, path: "src/target.ts", resolver: "second" };
      }
    };
    const thirdResolver = {
      name: "third",
      resolve: async () => {
        calls.push("third");
        return { type: "resolved" as const, path: "src/other.ts", resolver: "third" };
      }
    };

    await expect(
      resolveImport("virtual", "src/index.ts", context, [firstResolver, secondResolver, thirdResolver])
    ).resolves.toEqual({
      type: "resolved",
      path: "src/target.ts",
      resolver: "second"
    });
    expect(calls).toEqual(["first", "second"]);
  });

  it("stops resolver orchestration at the first external result", async () => {
    const calls: string[] = [];
    const context = { fs: createMemoryFileSystem() };
    const externalResolver = {
      name: "external",
      resolve: async () => {
        calls.push("external");
        return { type: "external" as const };
      }
    };
    const resolvedResolver = {
      name: "resolved",
      resolve: async () => {
        calls.push("resolved");
        return { type: "resolved" as const, path: "src/target.ts", resolver: "resolved" };
      }
    };

    await expect(resolveImport("react", "src/index.ts", context, [externalResolver, resolvedResolver])).resolves.toEqual({
      type: "external"
    });
    expect(calls).toEqual(["external"]);
  });
});
