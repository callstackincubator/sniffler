import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedEdge } from "../src/cache/cache-types.js";
import { getCacheConfigHash } from "../src/cache/cache-key.js";
import { createContentHashStaleChecker } from "../src/cache/stale-checker.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import type { Diagnostics } from "../src/diagnostics/diagnostics.js";
import { prepareImpactCacheState, saveImpactCache } from "../src/impact/cache-lifecycle.js";
import { SCANNER_VERSION } from "../src/cache/cache-key.js";

vi.mock("../src/scanner/scan-file.js", async () => {
  const actual = await vi.importActual<typeof import("../src/scanner/scan-file.js")>(
    "../src/scanner/scan-file.js"
  );

  return {
    ...actual,
    scanFileText: vi.fn(actual.scanFileText)
  };
});

vi.mock("../src/cache/save-cache.js", async () => {
  const actual = await vi.importActual<typeof import("../src/cache/save-cache.js")>(
    "../src/cache/save-cache.js"
  );

  return {
    ...actual,
    saveCache: vi.fn(async () => {
      throw new Error("save failed");
    })
  };
});

import { scanFileText } from "../src/scanner/scan-file.js";
import { saveCache } from "../src/cache/save-cache.js";

const emptyScanResult = {
  imports: [],
  exports: [],
  warnings: []
};

const hashText = (text: string): string => {
  return createHash("sha256").update(text).digest("hex");
};

const fixtureConfig = {
  source: {
    roots: ["src"],
    extensions: [".ts"],
    ignore: []
  },
  workspaces: {
    strategies: []
  },
  resolver: {
    tsconfig: "tsconfig.json",
    conditions: {
      import: ["import", "node", "default"],
      require: ["require", "node", "default"]
    }
  }
};

const createDiagnostics = (): Diagnostics & {
  metrics: Map<string, number | string | boolean>;
  warnings: Array<unknown>;
} => {
  const metrics = new Map<string, number | string | boolean>();
  const warnings: Array<unknown> = [];

  return {
    metrics,
    warnings,
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
    warning: (value) => {
      warnings.push(value);
    },
    flush: async () => {}
  };
};

const buildCache = (appText: string) => {
  return {
    version: 1,
    configHash: getCacheConfigHash(fixtureConfig),
    scannerVersion: SCANNER_VERSION,
    files: {
      "src/app.ts": {
        path: "src/app.ts",
        contentHash: hashText(appText),
        scan: emptyScanResult,
        resolvedEdges: []
      },
      "src/shared.ts": {
        path: "src/shared.ts",
        contentHash: hashText("export const shared = true;"),
        scan: emptyScanResult,
        resolvedEdges: []
      }
    }
  };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("impact cache lifecycle", () => {
  it("reuses cached scans without touching scanner", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/config.json": JSON.stringify({
        ...fixtureConfig,
        tests: {
          manifest: ".sniffler/test-map.json"
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
          }
        ]
      }),
      ".sniffler/cache.json": JSON.stringify(buildCache('import "./shared";\nexport const app = 1;')),
      "src/app.ts": 'import "./shared";\nexport const app = 1;',
      "src/shared.ts": "export const shared = true;"
    });

    const state = await prepareImpactCacheState({
      fs,
      cwd: ".",
      config: {
        ...fixtureConfig,
        tests: {
          manifest: ".sniffler/test-map.json"
        },
        cache: {
          path: ".sniffler/cache.json"
        }
      },
      diagnostics: createDiagnostics(),
      staleChecker: createContentHashStaleChecker(fs),
      sourceFiles: ["src/app.ts", "src/shared.ts"]
    });

    expect(vi.mocked(scanFileText)).not.toHaveBeenCalled();
    expect(state.graphNodes).toHaveLength(2);
    expect(state.warnings).toEqual([]);
  });

  it("swallows cache save failure", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/cache.json": JSON.stringify(buildCache("export const app = 1;")),
      ".sniffler/config.json": JSON.stringify({
        ...fixtureConfig,
        tests: {
          manifest: ".sniffler/test-map.json"
        },
        cache: {
          path: ".sniffler/cache.json"
        }
      })
    });
    const diagnostics = createDiagnostics();

    await expect(
      saveImpactCache({
        fs,
        diagnostics,
        state: {
          graphNodes: [],
          warnings: [],
          cachePath: ".sniffler/cache.json",
          configHash: getCacheConfigHash(fixtureConfig),
          cacheNeedsRefresh: true,
          stagedEntries: {},
          contentHashes: new Map()
        },
        graph: {
          nodes: [
            {
              path: "src/app.ts",
              scan: emptyScanResult,
              resolvedEdges: []
            }
          ],
          edges: [
            {
              from: "src/app.ts",
              to: "src/shared.ts",
              resolver: "relative",
              entities: { type: "all" },
              reExports: null
            } satisfies ResolvedEdge
          ],
          warnings: []
        }
      })
    ).resolves.toBeUndefined();

    expect(vi.mocked(saveCache)).toHaveBeenCalledTimes(1);
  });

});
