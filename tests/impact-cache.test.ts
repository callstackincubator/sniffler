import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCacheConfigHash } from "../src/cache/cache-key.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";

vi.mock("../src/scanner/scan-file.js", async () => {
  const actual = await vi.importActual<typeof import("../src/scanner/scan-file.js")>(
    "../src/scanner/scan-file.js"
  );

  return {
    ...actual,
    scanFileText: vi.fn(actual.scanFileText)
  };
});

import { selectImpact } from "../src/impact/impact-command.js";
import { scanFileText } from "../src/scanner/scan-file.js";

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

const createFixtureFileSystem = (options: { appText: string; cache?: unknown }) => {
  const entries: Record<string, string> = {
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
    "src/app.ts": options.appText,
    "src/shared.ts": "export const shared = true;"
  };

  if (options.cache !== undefined) {
    entries[".sniffler/cache.json"] = JSON.stringify(options.cache);
  }

  return createMemoryFileSystem(entries);
};

const buildCache = (appText: string, scannerVersion: string) => {
  return {
    version: 1,
    configHash: getCacheConfigHash(fixtureConfig),
    scannerVersion,
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

describe("impact cache", () => {
  it("reuses cached scan results for unchanged files", async () => {
    const fs = createFixtureFileSystem({
      appText: "export const app = 1;",
      cache: buildCache("export const app = 1;", "scan-file-v1")
    });

    const result = await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: "." });

    expect(result).toEqual({
      changedFiles: ["src/app.ts"],
      affectedModules: ["src/app.ts"],
      recommendedTests: [
        {
          test: "e2e/app.spec.ts",
          reasons: [
            {
              changedFile: "src/app.ts",
              declaredTarget: "src/app.ts",
              dependencyPath: ["src/app.ts"]
            }
          ]
        }
      ],
      warnings: []
    });
    expect(vi.mocked(scanFileText)).not.toHaveBeenCalled();
  });

  it("rescans changed content even when cache exists", async () => {
    const fs = createFixtureFileSystem({
      appText: "export const app = 2;",
      cache: buildCache("export const app = 1;", "scan-file-v1")
    });

    const result = await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: "." });

    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(result.affectedModules).toEqual(["src/app.ts"]);
    expect(vi.mocked(scanFileText)).toHaveBeenCalledTimes(1);
  });

  it("ignores cache entries from older scanner versions", async () => {
    const fs = createFixtureFileSystem({
      appText: "export const app = 1;",
      cache: buildCache("export const app = 1;", "scan-file-v0")
    });

    await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: "." });

    expect(vi.mocked(scanFileText)).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed cache files", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/config.json": JSON.stringify({
        source: {
          roots: ["src"],
          extensions: [".ts"],
          ignore: []
        },
        workspaces: {
          strategies: []
        },
        tests: {
          manifest: ".sniffler/test-map.json"
        },
        cache: {
          path: ".sniffler/cache.json"
        }
      }),
      ".sniffler/cache.json": "{",
      ".sniffler/test-map.json": JSON.stringify({
        tests: [
          {
            test: "e2e/app.spec.ts",
            targets: ["src/app.ts"]
          }
        ]
      }),
      "src/app.ts": "export const app = 1;",
      "src/shared.ts": "export const shared = true;"
    });

    const result = await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: "." });

    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(result.affectedModules).toEqual(["src/app.ts"]);
    expect(vi.mocked(scanFileText)).toHaveBeenCalledTimes(2);
  });
});
