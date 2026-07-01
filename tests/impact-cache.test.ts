import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedEdge } from "../src/cache/cache-types.js";
import { getCacheConfigHash } from "../src/cache/cache-key.js";
import { createMetadataStaleChecker } from "../src/cache/stale-checker.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import type { ScanResult } from "../src/scanner/scanner-types.js";

vi.mock("../src/scanner/scan-file.js", async () => {
  const actual = await vi.importActual<typeof import("../src/scanner/scan-file.js")>(
    "../src/scanner/scan-file.js"
  );

  return {
    ...actual,
    scanFileText: vi.fn(actual.scanFileText)
  };
});

vi.mock("../src/resolvers/resolve-import.js", async () => {
  const actual = await vi.importActual<typeof import("../src/resolvers/resolve-import.js")>(
    "../src/resolvers/resolve-import.js"
  );

  return {
    ...actual,
    resolveImport: vi.fn(actual.resolveImport)
  };
});

import { selectImpact } from "../src/impact/impact-command.js";
import { scanFileText } from "../src/scanner/scan-file.js";
import { resolveImport } from "../src/resolvers/resolve-import.js";

const emptyScanResult: ScanResult = {
  imports: [],
  exports: [],
  warnings: []
};

const appScanResult: ScanResult = {
  imports: [
    {
      specifier: "./shared",
      kind: "import",
      entities: {
        type: "all"
      }
    }
  ],
  exports: [],
  warnings: []
};

const appResolvedEdges: ReadonlyArray<ResolvedEdge> = [
  {
    from: "src/app.ts",
    to: "src/shared.ts",
    resolver: "relative",
    entities: {
      type: "all"
    },
    reExports: null
  }
];

const hashText = (text: string): string => {
  return createHash("sha256").update(text).digest("hex");
};

const fixtureConfig = {
  workers: 0,
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

const createFixtureFileSystem = (options: {
  appText: string;
  cache?: unknown;
  cacheStale?: "content" | "metadata";
  extraFiles?: Record<string, string>;
}) => {
  const entries: Record<string, string> = {
    ".sniffler/config.json": JSON.stringify({
      ...fixtureConfig,
      tests: {
        manifest: ".sniffler/test-map.json"
      },
      cache: {
        path: ".sniffler/cache.json",
        ...(options.cacheStale === undefined ? {} : { stale: options.cacheStale })
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

  if (options.extraFiles !== undefined) {
    Object.assign(entries, options.extraFiles);
  }

  if (options.cache !== undefined) {
    entries[".sniffler/cache.json"] = JSON.stringify(options.cache);
  }

  return createMemoryFileSystem(entries);
};

const buildCache = (
  appText: string,
  scannerVersion: string,
  options: {
    scan?: ScanResult;
    resolvedEdges?: ReadonlyArray<ResolvedEdge>;
    platform?: string;
  } = {}
) => {
  return {
    version: 1,
    configHash: getCacheConfigHash(fixtureConfig, { platform: options.platform }),
    scannerVersion,
    files: {
      "src/app.ts": {
        path: "src/app.ts",
        contentHash: hashText(appText),
        scan: options.scan ?? emptyScanResult,
        resolvedEdges: options.resolvedEdges ?? []
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
      appText: 'import "./shared";\nexport const app = 1;',
      cache: buildCache('import "./shared";\nexport const app = 1;', "scan-file-v1", {
        scan: appScanResult,
        resolvedEdges: appResolvedEdges
      })
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
    expect(vi.mocked(resolveImport)).not.toHaveBeenCalled();
  });

  it("rescans changed content even when cache exists", async () => {
    const fs = createFixtureFileSystem({
      appText: 'import "./shared";\nexport const app = 2;',
      cache: buildCache('import "./shared";\nexport const app = 1;', "scan-file-v1", {
        scan: appScanResult,
        resolvedEdges: appResolvedEdges
      })
    });

    const result = await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: "." });

    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(result.affectedModules).toEqual(["src/app.ts"]);
    expect(vi.mocked(scanFileText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveImport)).toHaveBeenCalledTimes(1);
  });

  it("writes metadata for rescanned entries so metadata mode can warm", async () => {
    const fs = createFixtureFileSystem({
      appText: 'import "./shared";\nexport const app = 1;',
      cache: {
        version: 1,
        configHash: getCacheConfigHash(fixtureConfig),
        scannerVersion: "scan-file-v1",
        files: {
          "src/app.ts": {
            path: "src/app.ts",
            contentHash: hashText('import "./shared";\nexport const app = 0;'),
            scan: emptyScanResult,
            resolvedEdges: []
          },
          "src/shared.ts": {
            path: "src/shared.ts",
            contentHash: hashText("export const shared = true;"),
            metadata: {
              size: "export const shared = true;".length,
              mtimeMs: 0
            },
            scan: emptyScanResult,
            resolvedEdges: []
          }
        }
      }
    });

    const metadataChecker = createMetadataStaleChecker(fs);
    await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: ".", staleChecker: metadataChecker });

    const savedCache = await fs.readJson<{
      files: Record<string, { metadata?: { size: number; mtimeMs: number } }>;
    }>(".sniffler/cache.json");

    expect(savedCache.files["src/app.ts"].metadata).toEqual({
      size: 'import "./shared";\nexport const app = 1;'.length,
      mtimeMs: 0
    });
    expect(savedCache.files["src/shared.ts"].metadata).toEqual({
      size: "export const shared = true;".length,
      mtimeMs: 0
    });

    vi.clearAllMocks();
    await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: ".", staleChecker: metadataChecker });
    expect(vi.mocked(scanFileText)).not.toHaveBeenCalled();
  });

  it("uses metadata stale checking when configured", async () => {
    const metadataConfig = {
      ...fixtureConfig,
      cache: {
        stale: "metadata" as const
      }
    };
    const fs = createFixtureFileSystem({
      appText: 'import "./shared";\nexport const app = 1;',
      cacheStale: "metadata",
      cache: {
        version: 1,
        configHash: getCacheConfigHash(metadataConfig),
        scannerVersion: "scan-file-v1",
        files: {
          "src/app.ts": {
            path: "src/app.ts",
            contentHash: hashText('import "./shared";\nexport const app = 0;'),
            metadata: {
              size: 'import "./shared";\nexport const app = 1;'.length,
              mtimeMs: 0
            },
            scan: appScanResult,
            resolvedEdges: appResolvedEdges
          },
          "src/shared.ts": {
            path: "src/shared.ts",
            contentHash: hashText("export const shared = true;"),
            metadata: {
              size: "export const shared = true;".length,
              mtimeMs: 0
            },
            scan: emptyScanResult,
            resolvedEdges: []
          }
        }
      }
    });

    await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: "." });

    expect(vi.mocked(scanFileText)).not.toHaveBeenCalled();
    expect(vi.mocked(resolveImport)).not.toHaveBeenCalled();
  });

  it("recomputes resolved edges when the source inventory changes", async () => {
    const fs = createFixtureFileSystem({
      appText: 'import "./shared";\nexport const app = 1;',
      cache: buildCache('import "./shared";\nexport const app = 1;', "scan-file-v1", {
        scan: appScanResult,
        resolvedEdges: appResolvedEdges
      }),
      extraFiles: {
        "src/extra.ts": "export const extra = true;"
      }
    });

    await selectImpact({ changedFiles: ["src/app.ts"] }, { fs, cwd: "." });

    expect(vi.mocked(scanFileText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveImport)).toHaveBeenCalledTimes(1);
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
        workers: 0,
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

  it("keeps cache edges isolated by platform", async () => {
    const androidHash = getCacheConfigHash(fixtureConfig, { platform: "android" });
    const iosHash = getCacheConfigHash(fixtureConfig, { platform: "ios" });
    const defaultHash = getCacheConfigHash(fixtureConfig);
    const androidScanResult: ScanResult = {
      imports: [
        {
          specifier: "./Button",
          kind: "import",
          entities: {
            type: "all"
          }
        }
      ],
      exports: [],
      warnings: []
    };
    const androidResolvedEdges: ReadonlyArray<ResolvedEdge> = [
      {
        from: "src/app.ts",
        to: "src/Button.android.ts",
        resolver: "relative",
        entities: {
          type: "all"
        },
        reExports: null
      }
    ];

    expect(androidHash).not.toBe(defaultHash);
    expect(iosHash).not.toBe(defaultHash);
    expect(androidHash).not.toBe(iosHash);

    const createPlatformCacheFixture = () =>
      createMemoryFileSystem({
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
        ".sniffler/cache.json": JSON.stringify({
          version: 1,
          configHash: androidHash,
          scannerVersion: "scan-file-v1",
          files: {
            "src/app.ts": {
              path: "src/app.ts",
              contentHash: hashText('import "./Button";\nexport const app = 1;'),
              scan: androidScanResult,
              resolvedEdges: androidResolvedEdges
            },
            "src/Button.ts": {
              path: "src/Button.ts",
              contentHash: hashText("export const Button = true;"),
              scan: emptyScanResult,
              resolvedEdges: []
            },
            "src/Button.android.ts": {
              path: "src/Button.android.ts",
              contentHash: hashText("export const Button = true;"),
              scan: emptyScanResult,
              resolvedEdges: []
            },
            "src/Button.native.ts": {
              path: "src/Button.native.ts",
              contentHash: hashText("export const Button = true;"),
              scan: emptyScanResult,
              resolvedEdges: []
            },
            "src/Button.ios.ts": {
              path: "src/Button.ios.ts",
              contentHash: hashText("export const Button = true;"),
              scan: emptyScanResult,
              resolvedEdges: []
            }
          }
        }),
        "src/app.ts": 'import "./Button";\nexport const app = 1;',
        "src/Button.ts": "export const Button = true;",
        "src/Button.android.ts": "export const Button = true;",
        "src/Button.native.ts": "export const Button = true;",
        "src/Button.ios.ts": "export const Button = true;"
      });

    const defaultFs = createPlatformCacheFixture();
    await selectImpact({ changedFiles: ["src/app.ts"] }, { fs: defaultFs, cwd: "." });
    expect(vi.mocked(scanFileText)).toHaveBeenCalledTimes(5);
    expect(vi.mocked(resolveImport)).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const androidFs = createPlatformCacheFixture();
    await selectImpact({ changedFiles: ["src/app.ts"], platform: "android" }, { fs: androidFs, cwd: "." });
    expect(vi.mocked(scanFileText)).not.toHaveBeenCalled();
    expect(vi.mocked(resolveImport)).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const iosFs = createPlatformCacheFixture();
    await selectImpact({ changedFiles: ["src/app.ts"], platform: "ios" }, { fs: iosFs, cwd: "." });
    expect(vi.mocked(scanFileText)).toHaveBeenCalledTimes(5);
    expect(vi.mocked(resolveImport)).toHaveBeenCalledTimes(1);
  });
});
