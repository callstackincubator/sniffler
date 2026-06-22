import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import type { Diagnostics } from "../src/diagnostics/diagnostics.js";
import { resolveImport, type Resolver } from "../src/resolvers/resolve-import.js";
import { tsconfigPathsResolver } from "../src/resolvers/tsconfig-paths-resolver.js";

const createDiagnostics = (): Diagnostics & {
  metrics: Map<string, number | string | boolean>;
  stages: Array<{ name: string; durationMs: number }>;
} => {
  const metrics = new Map<string, number | string | boolean>();
  const stages: Array<{ name: string; durationMs: number }> = [];

  return {
    metrics,
    stages,
    time: async <T>(name: string, action: () => Promise<T>): Promise<T> => {
      const startedAt = performance.now();
      try {
        return await action();
      } finally {
        stages.push({
          name,
          durationMs: performance.now() - startedAt
        });
      }
    },
    record: (name: string, value: number | string | boolean) => {
      metrics.set(name, value);
    },
    increment: (name: string, amount = 1) => {
      const current = metrics.get(name);
      metrics.set(name, typeof current === "number" ? current + amount : amount);
    },
    warning: () => {},
    flush: async () => {}
  };
};

describe("resolveImport diagnostics", () => {
  it("tracks cache hits, cache misses, and builtin externals", async () => {
    const diagnostics = createDiagnostics();
    const resolutionCache = new Map<string, Awaited<ReturnType<typeof resolveImport>>>();
    const fs = createMemoryFileSystem();

    const first = await resolveImport(
      "fs",
      "src/app.ts",
      {
        fs,
        diagnostics,
        resolutionCache
      },
      []
    );

    const second = await resolveImport(
      "fs",
      "src/app.ts",
      {
        fs,
        diagnostics,
        resolutionCache
      },
      []
    );

    expect(first).toEqual({ type: "external" });
    expect(second).toEqual({ type: "external" });
    expect(diagnostics.metrics.get("graphResolutionCacheMisses")).toBe(1);
    expect(diagnostics.metrics.get("graphResolutionCacheHits")).toBe(1);
    expect(diagnostics.metrics.get("graphResolverBuiltinExternal")).toBe(1);
  });

  it("records fixed resolver namespaces instead of raw resolver names", async () => {
    const diagnostics = createDiagnostics();
    const fs = createMemoryFileSystem();

    const cases: Array<{
      resolver: Resolver;
      specifier: string;
      expected: unknown;
    }> = [
      {
        resolver: {
          name: "tsconfig-paths",
          resolve: async () => ({
            type: "resolved",
            path: "src/alias.ts",
            resolver: "tsconfig-paths"
          })
        },
        specifier: "@alias",
        expected: {
          type: "resolved",
          path: "src/alias.ts",
          resolver: "tsconfig-paths"
        }
      },
      {
        resolver: {
          name: "package-exports",
          resolve: async () => ({
            type: "external"
          })
        },
        specifier: "@pkg",
        expected: {
          type: "external"
        }
      },
      {
        resolver: {
          name: "workspace-package",
          resolve: async () => ({
            type: "unresolved",
            warning: "No workspace package match"
          })
        },
        specifier: "@workspace",
        expected: {
          type: "unresolved",
          warning: "Unable to resolve @workspace from src/app.ts"
        }
      },
      {
        resolver: {
          name: "mystery",
          resolve: async () => ({
            type: "resolved",
            path: "src/mystery.ts",
            resolver: "mystery"
          })
        },
        specifier: "@mystery",
        expected: {
          type: "resolved",
          path: "src/mystery.ts",
          resolver: "mystery"
        }
      }
    ];

    for (const entry of cases) {
      const result = await resolveImport(
        entry.specifier,
        "src/app.ts",
        {
          fs,
          diagnostics
        },
        [entry.resolver]
      );

      expect(result).toEqual(entry.expected);
    }

    expect(diagnostics.metrics.get("graphResolver.tsconfigPaths.attempts")).toBe(1);
    expect(diagnostics.metrics.get("graphResolver.tsconfigPaths.resolved")).toBe(1);
    expect(diagnostics.metrics.get("graphResolver.packageExports.external")).toBe(1);
    expect(diagnostics.metrics.get("graphResolver.workspacePackage.unresolved")).toBe(1);
    expect(diagnostics.metrics.get("graphResolver.other.resolved")).toBe(1);
    expect(diagnostics.metrics.get("graphResolver.other.attempts")).toBe(1);
    expect((diagnostics.metrics.get("graphResolver.tsconfigPaths.durationMs") as number) > 0).toBe(true);
  });

  it("keeps tsconfig diagnostics counts per call while alias caches lower stat probes", async () => {
    const diagnostics = createDiagnostics();
    const baseFs = createMemoryFileSystem({
      "packages/shared/src/button.ts": "export const button = true;"
    });
    const sourceCandidateCache = new Map<string, Promise<string | undefined>>();
    const tsconfigPathsResolutionCache = new Map<string, Promise<Awaited<ReturnType<typeof resolveImport>>>>();
    let statCalls = 0;
    const fs = {
      ...baseFs,
      stat: async (path: string) => {
        statCalls += 1;
        return baseFs.stat(path);
      }
    };

    const context = {
      fs,
      diagnostics,
      sourceCandidateCache,
      tsconfigPathsResolutionCache,
      tsconfigPaths: {
        baseUrl: ".",
        paths: {
          "@shared/*": ["packages/shared/src/*"]
        }
      }
    };

    await resolveImport("@shared/button", "apps/web/src/routes.ts", context, [tsconfigPathsResolver]);
    await resolveImport("@shared/button", "apps/native/src/routes.ts", context, [tsconfigPathsResolver]);

    expect(diagnostics.metrics.get("graphResolver.tsconfigPaths.attempts")).toBe(2);
    expect(diagnostics.metrics.get("graphResolver.tsconfigPaths.resolved")).toBe(2);
    expect(statCalls).toBe(2);
  });
});
