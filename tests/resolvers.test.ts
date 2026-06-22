import { describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { resolveImport, type ResolveResult } from "../src/resolvers/resolve-import.js";
import { relativeResolver } from "../src/resolvers/relative-resolver.js";
import { resolveSourceFileCandidate } from "../src/resolvers/source-file-candidate.js";
import { tsconfigPathsResolver } from "../src/resolvers/tsconfig-paths-resolver.js";
import { packageExportsResolver } from "../src/resolvers/package-exports-resolver.js";
import { workspacePackageResolver } from "../src/resolvers/workspace-package-resolver.js";

const createStatCountingFileSystem = (entries: Record<string, string> = {}) => {
  const baseFs = createMemoryFileSystem(entries);
  let statCalls = 0;

  return {
    fs: {
      ...baseFs,
      stat: async (path: string) => {
        statCalls += 1;
        return baseFs.stat(path);
      }
    },
    getStatCalls: () => statCalls
  };
};

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

describe("relativeResolver", () => {
  it("keeps existing behavior when platform missing", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.ts": "export const Button = true;",
      "src/components/Button.native.ts": "export const Button = true;"
    });

    const context = {
      fs,
      sourceExtensions: [".ts", ".tsx"]
    };

    await expect(relativeResolver.resolve("./components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.ts",
      resolver: "relative"
    });
  });

  it("follows android, native, generic order per source extension", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.native.ts": "export const Button = true;",
      "src/components/Button.android.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      platform: "android",
      sourceExtensions: [".ts", ".tsx"]
    };

    await expect(relativeResolver.resolve("./components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.native.ts",
      resolver: "relative"
    });
  });

  it("falls back to generic source files when platform files are missing", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      platform: "android",
      sourceExtensions: [".ts", ".tsx"]
    };

    await expect(relativeResolver.resolve("./components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.tsx",
      resolver: "relative"
    });
  });

  it("does not pick other platform files implicitly", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.ios.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      platform: "android",
      sourceExtensions: [".ts", ".tsx"]
    };

    await expect(relativeResolver.resolve("./components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "unresolved",
      warning: "No source file matched ./components/Button"
    });
  });

  it("keeps explicit source-extension imports exact", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.ios.tsx": "export const Button = true;",
      "src/components/Button.android.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      platform: "android",
      sourceExtensions: [".ts", ".tsx"]
    };

    await expect(relativeResolver.resolve("./components/Button.ios.tsx", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.ios.tsx",
      resolver: "relative"
    });
  });

  it("treats platform-like suffixes as candidate prefixes", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.ios.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      platform: "android",
      sourceExtensions: [".ts", ".tsx"]
    };

    await expect(relativeResolver.resolve("./components/Button.ios", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.ios.tsx",
      resolver: "relative"
    });
  });
});

describe("tsconfigPathsResolver platform probing", () => {
  it("applies platform probing after alias expansion", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.native.ts": "export const Button = true;",
      "src/components/Button.android.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      platform: "android",
      sourceExtensions: [".ts", ".tsx"],
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@components/*": ["src/components/*"]
        }
      }
    };

    await expect(tsconfigPathsResolver.resolve("@components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.native.ts",
      resolver: "tsconfig-paths"
    });
  });

  it("treats aliased platform-like suffixes as candidate prefixes", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.ios.tsx": "export const Button = true;"
    });

    const context = {
      fs,
      platform: "android",
      sourceExtensions: [".ts", ".tsx"],
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@components/*": ["src/components/*"]
        }
      }
    };

    await expect(tsconfigPathsResolver.resolve("@components/Button.ios", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.ios.tsx",
      resolver: "tsconfig-paths"
    });
  });
});

describe("source file candidate cache", () => {
  it("reuses tsconfig candidate probes across fromFiles", async () => {
    const { fs, getStatCalls } = createStatCountingFileSystem({
      "packages/shared/src/button.ts": "export const button = true;"
    });
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const tsconfigPathsResolutionCache = new Map<string, Promise<ResolveResult>>();
    const context = {
      fs,
      sourceExtensions: [".ts", ".tsx"],
      sourceCandidateCache,
      tsconfigPathsResolutionCache,
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@shared/*": ["packages/shared/src/*"]
        }
      }
    };

    await expect(resolveImport("@shared/button", "apps/web/src/routes.ts", context, [tsconfigPathsResolver])).resolves.toEqual({
      type: "resolved",
      path: "packages/shared/src/button.ts",
      resolver: "tsconfig-paths"
    });

    await expect(resolveImport("@shared/button", "apps/native/src/routes.ts", context, [tsconfigPathsResolver])).resolves.toEqual({
      type: "resolved",
      path: "packages/shared/src/button.ts",
      resolver: "tsconfig-paths"
    });

    expect(getStatCalls()).toBe(2);
  });

  it("caches exact tsconfig aliases across fromFiles", async () => {
    const { fs, getStatCalls } = createStatCountingFileSystem({
      "packages/shared/src/index.ts": "export const index = true;"
    });
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const tsconfigPathsResolutionCache = new Map<string, Promise<ResolveResult>>();
    const context = {
      fs,
      sourceCandidateCache,
      tsconfigPathsResolutionCache,
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@shared": ["packages/shared/src/index.ts"]
        }
      }
    };

    await expect(resolveImport("@shared", "apps/web/src/routes.ts", context, [tsconfigPathsResolver])).resolves.toEqual({
      type: "resolved",
      path: "packages/shared/src/index.ts",
      resolver: "tsconfig-paths"
    });

    await expect(resolveImport("@shared", "apps/native/src/routes.ts", context, [tsconfigPathsResolver])).resolves.toEqual({
      type: "resolved",
      path: "packages/shared/src/index.ts",
      resolver: "tsconfig-paths"
    });

    expect(getStatCalls()).toBe(1);
  });

  it("caches unresolved tsconfig candidate probes across fromFiles", async () => {
    const { fs, getStatCalls } = createStatCountingFileSystem();
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const tsconfigPathsResolutionCache = new Map<string, Promise<ResolveResult>>();
    const context = {
      fs,
      sourceExtensions: [".ts"],
      sourceCandidateCache,
      tsconfigPathsResolutionCache,
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@missing/*": ["src/missing/*"]
        }
      }
    };

    await expect(resolveImport("@missing/Button", "apps/web/src/routes.ts", context, [tsconfigPathsResolver])).resolves.toEqual({
      type: "unresolved",
      warning: "Unable to resolve @missing/Button from apps/web/src/routes.ts"
    });

    await expect(resolveImport("@missing/Button", "apps/native/src/routes.ts", context, [tsconfigPathsResolver])).resolves.toEqual({
      type: "unresolved",
      warning: "Unable to resolve @missing/Button from apps/native/src/routes.ts"
    });

    expect(getStatCalls()).toBe(3);
  });

  it("keeps tsconfig result cache separated by paths signature", async () => {
    const fs = createMemoryFileSystem({
      "packages/a/foo.ts": "export const foo = true;",
      "packages/b/foo.ts": "export const foo = true;"
    });
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const tsconfigPathsResolutionCache = new Map<string, Promise<ResolveResult>>();
    const sharedContext = {
      fs,
      sourceCandidateCache,
      tsconfigPathsResolutionCache
    };

    await expect(
      resolveImport(
        "@shared/foo",
        "src/app.ts",
        {
          ...sharedContext,
          tsconfigPaths: {
            baseUrl: ".",
            paths: {
              "@shared/*": ["packages/a/*"]
            }
          }
        },
        [tsconfigPathsResolver]
      )
    ).resolves.toEqual({
      type: "resolved",
      path: "packages/a/foo.ts",
      resolver: "tsconfig-paths"
    });

    await expect(
      resolveImport(
        "@shared/foo",
        "src/app.ts",
        {
          ...sharedContext,
          tsconfigPaths: {
            baseUrl: ".",
            paths: {
              "@shared/*": ["packages/b/*"]
            }
          }
        },
        [tsconfigPathsResolver]
      )
    ).resolves.toEqual({
      type: "resolved",
      path: "packages/b/foo.ts",
      resolver: "tsconfig-paths"
    });
  });

  it("keeps baseUrl-less wildcard caches scoped by fromFile directory", async () => {
    const fs = createMemoryFileSystem({
      "apps/web/src/components/button.ts": "export const button = true;",
      "packages/shared/src/components/button.ts": "export const button = true;"
    });
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const tsconfigPathsResolutionCache = new Map<string, Promise<ResolveResult>>();
    const context = {
      fs,
      sourceCandidateCache,
      tsconfigPathsResolutionCache,
      tsconfigPaths: {
        paths: {
          "@shared/*": ["components/*"]
        }
      }
    };

    await expect(resolveImport("@shared/button", "apps/web/src/routes.ts", context, [tsconfigPathsResolver])).resolves.toEqual({
      type: "resolved",
      path: "apps/web/src/components/button.ts",
      resolver: "tsconfig-paths"
    });

    await expect(
      resolveImport("@shared/button", "packages/shared/src/routes.ts", context, [tsconfigPathsResolver])
    ).resolves.toEqual({
      type: "resolved",
      path: "packages/shared/src/components/button.ts",
      resolver: "tsconfig-paths"
    });
  });

  it("keeps relative resolution stable while reusing candidate probes", async () => {
    const { fs, getStatCalls } = createStatCountingFileSystem({
      "src/components/Button.ts": "export const Button = true;"
    });
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const context = {
      fs,
      sourceCandidateCache
    };

    await expect(relativeResolver.resolve("./components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.ts",
      resolver: "relative"
    });

    await expect(relativeResolver.resolve("./components/Button", "src/app.ts", context)).resolves.toEqual({
      type: "resolved",
      path: "src/components/Button.ts",
      resolver: "relative"
    });

    expect(getStatCalls()).toBe(2);
  });

  it("keeps platform-specific and extension-specific candidate caches separate", async () => {
    const fs = createMemoryFileSystem({
      "src/components/Button.android.tsx": "export const Button = true;",
      "src/components/Button.ios.tsx": "export const Button = true;",
      "src/components/Button.ts": "export const Button = true;",
      "src/components/Button.tsx": "export const Button = true;"
    });
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();

    await expect(
      resolveSourceFileCandidate("src/components/Button", {
        fs,
        platform: "android",
        sourceExtensions: [".tsx"],
        sourceCandidateCache
      })
    ).resolves.toBe("src/components/Button.android.tsx");

    await expect(
      resolveSourceFileCandidate("src/components/Button", {
        fs,
        platform: "ios",
        sourceExtensions: [".tsx"],
        sourceCandidateCache
      })
    ).resolves.toBe("src/components/Button.ios.tsx");

    await expect(
      resolveSourceFileCandidate("src/components/Button", {
        fs,
        sourceExtensions: [".ts"],
        sourceCandidateCache
      })
    ).resolves.toBe("src/components/Button.ts");

    await expect(
      resolveSourceFileCandidate("src/components/Button", {
        fs,
        sourceExtensions: [".tsx"],
        sourceCandidateCache
      })
    ).resolves.toBe("src/components/Button.tsx");
  });

  it("keeps cached tsconfig misses flowing into later resolvers", async () => {
    const onWarning = vi.fn();
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const tsconfigPathsResolutionCache = new Map<string, Promise<ResolveResult>>();
    const context = {
      fs: createMemoryFileSystem(),
      onWarning,
      sourceCandidateCache,
      tsconfigPathsResolutionCache,
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@shared": ["src/missing.ts"]
        }
      }
    };

    await expect(resolveImport("@shared", "src/app.ts", context, [tsconfigPathsResolver, packageExportsResolver])).resolves.toEqual({
      type: "external"
    });

    await expect(resolveImport("@shared", "src/feature.ts", context, [tsconfigPathsResolver, packageExportsResolver])).resolves.toEqual({
      type: "external"
    });

    expect(onWarning).not.toHaveBeenCalled();
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
