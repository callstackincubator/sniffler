import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostics } from "../src/diagnostics/diagnostics.js";
import { selectImpact } from "../src/impact/impact-command.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";

const createDiagnostics = (): Diagnostics & { stages: Array<{ name: string; durationMs: number }> } => {
  const stages: Array<{ name: string; durationMs: number }> = [];

  return {
    stages,
    time: async <T>(name: string, action: () => Promise<T>): Promise<T> => {
      const startedAt = Date.now();
      try {
        return await action();
      } finally {
        stages.push({ name, durationMs: Math.max(0, Date.now() - startedAt) });
      }
    },
    record: () => {},
    increment: () => {},
    warning: () => {},
    flush: async () => {}
  };
};

const createFixtureFileSystem = (runAllWhenChanged: ReadonlyArray<string>) => {
  return createMemoryFileSystem({
    ".sniffler/config.json": JSON.stringify({
      source: {
        roots: ["src"],
        extensions: [".ts"],
        ignore: []
      },
      workspaces: {
        strategies: ["package-json", "pnpm-workspace"]
      },
      resolver: {
        tsconfig: "tsconfig.json",
        conditions: {
          import: ["import", "node", "default"],
          require: ["require", "node", "default"]
        }
      },
      tests: {
        manifest: ".sniffler/test-map.json",
        runAllWhenChanged
      },
      cache: {
        path: ".sniffler/cache.json"
      }
    }),
    ".sniffler/test-map.json": JSON.stringify({
      tests: [
        {
          test: "e2e/app.spec.ts",
          targets: ["src/app.ts"]
        },
        {
          test: "e2e/feature.spec.ts",
          targets: ["src/feature.ts"]
        }
      ]
    }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "src/app.ts": "export const app = true;\n",
    "src/feature.ts": "export const feature = true;\n"
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("run-all when changed", () => {
  it("selects every test when exact path matches", async () => {
    const fs = createFixtureFileSystem(["pnpm-lock.yaml"]);

    const result = await selectImpact({ changedFiles: ["pnpm-lock.yaml"] }, { fs, cwd: "." });

    expect(result).toEqual({
      changedFiles: ["pnpm-lock.yaml"],
      affectedModules: [],
      recommendedTests: [
        {
          test: "e2e/app.spec.ts",
          reasons: [
            {
              kind: "run-all",
              changedFile: "pnpm-lock.yaml",
              declaredTarget: "pnpm-lock.yaml"
            }
          ]
        },
        {
          test: "e2e/feature.spec.ts",
          reasons: [
            {
              kind: "run-all",
              changedFile: "pnpm-lock.yaml",
              declaredTarget: "pnpm-lock.yaml"
            }
          ]
        }
      ],
      warnings: []
    });
  });

  it("selects every test when glob matches", async () => {
    const fs = createFixtureFileSystem(["**/pnpm-lock.yaml"]);

    const result = await selectImpact({ changedFiles: ["packages/web/pnpm-lock.yaml"] }, { fs, cwd: "." });

    expect(result.recommendedTests).toEqual([
      {
        test: "e2e/app.spec.ts",
        reasons: [
          {
            kind: "run-all",
            changedFile: "packages/web/pnpm-lock.yaml",
            declaredTarget: "**/pnpm-lock.yaml"
          }
        ]
      },
      {
        test: "e2e/feature.spec.ts",
        reasons: [
          {
            kind: "run-all",
            changedFile: "packages/web/pnpm-lock.yaml",
            declaredTarget: "**/pnpm-lock.yaml"
          }
        ]
      }
    ]);
  });

  it("short-circuits before graph, cache, and source work", async () => {
    const fs = createFixtureFileSystem(["pnpm-lock.yaml"]);
    const readJsonSpy = vi.spyOn(fs, "readJson");
    const globSpy = vi.spyOn(fs, "glob");
    const readFileSpy = vi.spyOn(fs, "readFile");
    const cacheStoreFactory = vi.fn();
    const diagnostics = createDiagnostics();

    const result = await selectImpact(
      { changedFiles: ["pnpm-lock.yaml"] },
      {
        fs,
        cwd: ".",
        diagnostics,
        cacheStoreFactory
      }
    );

    expect(result.recommendedTests).toHaveLength(2);
    expect(cacheStoreFactory).not.toHaveBeenCalled();
    expect(globSpy).not.toHaveBeenCalled();
    expect(readFileSpy).not.toHaveBeenCalled();
    expect(readJsonSpy).toHaveBeenCalledWith(".sniffler/config.json");
    expect(readJsonSpy).toHaveBeenCalledWith(".sniffler/test-map.json");
    expect(readJsonSpy).not.toHaveBeenCalledWith(".sniffler/cache.json");
    expect(diagnostics.stages.map((stage) => stage.name)).toEqual([
      "impact.config.load",
      "impact.changedFiles.resolve",
      "impact.testMap.load"
    ]);
  });
});
