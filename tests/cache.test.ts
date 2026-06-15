import { describe, expect, it, vi } from "vitest";
import type { FileSystem } from "../src/filesystem/filesystem.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { loadCache } from "../src/cache/load-cache.js";
import { saveCache } from "../src/cache/save-cache.js";
import type { GraphCache } from "../src/cache/cache-types.js";

const validCache: GraphCache = {
  version: 1,
  configHash: "config-hash-1",
  scannerVersion: "scanner-1",
  files: {
    "src/app.ts": {
      path: "src/app.ts",
      contentHash: "content-hash-1",
      scan: {
        imports: [
          {
            specifier: "./shared.ts",
            kind: "import"
          }
        ],
        warnings: []
      },
      resolvedEdges: [
        {
          from: "src/app.ts",
          to: "src/shared.ts",
          resolver: "relative"
        }
      ]
    }
  }
};

describe("cache", () => {
  it("loads a valid cache when the expected hashes match", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/cache.json": JSON.stringify(validCache)
    });

    await expect(
      loadCache(fs, ".sniffler/cache.json", {
        configHash: "config-hash-1",
        scannerVersion: "scanner-1"
      })
    ).resolves.toEqual(validCache);
  });

  it("discards cache data when the config hash changes", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/cache.json": JSON.stringify(validCache)
    });

    await expect(
      loadCache(fs, ".sniffler/cache.json", {
        configHash: "config-hash-2",
        scannerVersion: "scanner-1"
      })
    ).resolves.toBeNull();
  });

  it("returns null for missing or malformed cache files", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/cache.json": "{"
    });

    await expect(
      loadCache(fs, ".sniffler/cache.json", {
        configHash: "config-hash-1",
        scannerVersion: "scanner-1"
      })
    ).resolves.toBeNull();

    const missingFs = createMemoryFileSystem();

    await expect(
      loadCache(missingFs, ".sniffler/cache.json", {
        configHash: "config-hash-1",
        scannerVersion: "scanner-1"
      })
    ).resolves.toBeNull();
  });

  it("saves cache atomically by writing a temp file and renaming it into place", async () => {
    const calls: Array<{ method: string; path: string; content?: string }> = [];

    const fs: FileSystem = {
      readFile: async () => {
        throw new Error("not used");
      },
      readJson: async () => {
        throw new Error("not used");
      },
      exists: async () => false,
      glob: async () => [],
      stat: async () => {
        throw new Error("not used");
      },
      writeFile: vi.fn(async (path: string, content: string) => {
        calls.push({ method: "writeFile", path, content });
      }),
      rename: vi.fn(async (from: string, to: string) => {
        calls.push({ method: "rename", path: `${from} -> ${to}` });
      })
    };

    await saveCache(fs, ".sniffler/cache.json", validCache);

    expect(calls).toEqual([
      {
        method: "writeFile",
        path: ".sniffler/cache.json.tmp",
        content: `${JSON.stringify(validCache, null, 2)}\n`
      },
      {
        method: "rename",
        path: ".sniffler/cache.json.tmp -> .sniffler/cache.json"
      }
    ]);
  });
});
