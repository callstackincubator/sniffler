import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import type { Diagnostics } from "../src/diagnostics/diagnostics.js";
import { selectImpact } from "../src/impact/impact-command.js";

const baseConfig = {
  source: {
    roots: ["src"],
    extensions: [".ts"],
    ignore: ["**/*.test.ts"]
  },
  workspaces: {
    strategies: []
  },
  tests: {
    manifest: ".sniffler/test-map.json"
  }
};

const createFixtureFileSystem = (includeNodeModules: boolean) => {
  return createMemoryFileSystem({
    ".sniffler/config.json": JSON.stringify({
      ...baseConfig,
      source: {
        ...baseConfig.source,
        includeNodeModules
      }
    }),
    ".sniffler/test-map.json": JSON.stringify({ tests: [] }),
    "src/app.test.ts": "export const ignored = true;\n",
    "src/app.ts": "export const app = true;\n",
    "src/nested/feature.ts": "export const feature = true;\n",
    "src/node_modules/pkg/index.ts": "export const pkg = true;\n",
    "src/shared.ts": "export const shared = true;\n"
  });
};

const createDiagnostics = (): Diagnostics & { metrics: Map<string, number | string | boolean> } => {
  const metrics = new Map<string, number | string | boolean>();

  return {
    metrics,
    time: async <T>(_name: string, action: () => Promise<T>): Promise<T> => {
      return await action();
    },
    record: (name: string, value: number | string | boolean) => {
      metrics.set(name, value);
    },
    increment: (name: string, amount = 1) => {
      const current = metrics.get(name);
      metrics.set(name, typeof current === "number" ? current + amount : amount);
    },
    flush: async () => {}
  };
};

describe("discoverSourceFiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a single glob call with ignore and node_modules pruning when pruning is enabled", async () => {
    const fs = createFixtureFileSystem(false);
    const globSpy = vi.spyOn(fs, "glob");
    const diagnostics = createDiagnostics();

    const result = await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: ".", diagnostics });

    expect(globSpy).toHaveBeenCalledTimes(1);
    expect(globSpy).toHaveBeenCalledWith(["src/**/*.ts"], {
      cwd: ".",
      dot: true,
      ignore: ["**/*.test.ts"],
      pruneDirectories: ["node_modules"]
    });
    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(diagnostics.metrics.get("sourceFiles")).toBe(3);
  });

  it("disables node_modules pruning when includeNodeModules is enabled", async () => {
    const fs = createFixtureFileSystem(true);
    const globSpy = vi.spyOn(fs, "glob");
    const diagnostics = createDiagnostics();

    await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: ".", diagnostics });

    expect(globSpy).toHaveBeenCalledTimes(1);
    expect(globSpy).toHaveBeenCalledWith(["src/**/*.ts"], {
      cwd: ".",
      dot: true,
      ignore: ["**/*.test.ts"],
      pruneDirectories: []
    });
    expect(diagnostics.metrics.get("sourceFiles")).toBe(4);
  });

  it("keeps root-level files discoverable when roots include '.'", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/config.json": JSON.stringify({
        source: {
          roots: ["."],
          extensions: [".ts"],
          ignore: []
        },
        workspaces: {
          strategies: []
        },
        tests: {
          manifest: ".sniffler/test-map.json"
        }
      }),
      ".sniffler/test-map.json": JSON.stringify({ tests: [] }),
      "root.ts": "export const root = true;\n",
      "src/nested/feature.ts": "export const feature = true;\n"
    });
    const diagnostics = createDiagnostics();

    await selectImpact({ changedFiles: ["root.ts"] }, { fs, cwd: ".", diagnostics });

    expect(diagnostics.metrics.get("sourceFiles")).toBe(2);
  });
});
