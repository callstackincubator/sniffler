import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createContentHashStaleChecker, createMetadataStaleChecker } from "../src/cache/stale-checker.js";
import type { FileSystem } from "../src/filesystem/filesystem.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import type { CacheEntry } from "../src/cache/cache-types.js";

const hash = (text: string): string => {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
};

const createEntry = (input: Partial<CacheEntry> = {}): CacheEntry => {
  return {
    path: "src/app.ts",
    contentHash: hash("export const app = 1;"),
    scan: {
      imports: [],
      exports: [],
      warnings: []
    },
    resolvedEdges: [],
    ...input
  };
};

describe("stale checkers", () => {
  it("treats matching content hashes as fresh", async () => {
    const fs = createMemoryFileSystem({
      "src/app.ts": "export const app = 1;"
    });

    const checker = createContentHashStaleChecker(fs);
    await expect(checker.isStale({ path: "src/app.ts", entry: createEntry() })).resolves.toBe(false);
  });

  it("treats mismatching content hashes as stale", async () => {
    const fs = createMemoryFileSystem({
      "src/app.ts": "export const app = 2;"
    });

    const checker = createContentHashStaleChecker(fs);
    await expect(checker.isStale({ path: "src/app.ts", entry: createEntry() })).resolves.toBe(true);
  });

  it("treats matching metadata as fresh", async () => {
    const fs = {
      readFile: vi.fn(async () => {
        throw new Error("readFile should not be called");
      }),
      readFileBuffer: vi.fn(async () => {
        throw new Error("readFileBuffer should not be called");
      }),
      readJson: vi.fn(),
      exists: vi.fn(),
      glob: vi.fn(),
      stat: vi.fn(async () => ({
        isFile: true,
        isDirectory: false,
        size: 21,
        mtimeMs: 12
      })),
      writeFile: vi.fn(),
      rename: vi.fn()
    } satisfies FileSystem;

    const checker = createMetadataStaleChecker(fs);
    await expect(
      checker.isStale({
        path: "src/app.ts",
        entry: createEntry({
          metadata: {
            size: 21,
            mtimeMs: 12
          }
        })
      })
    ).resolves.toBe(false);
  });

  it("treats missing metadata as stale", async () => {
    const fs = createMemoryFileSystem({
      "src/app.ts": "export const app = 1;"
    });

    const checker = createMetadataStaleChecker(fs);
    await expect(checker.isStale({ path: "src/app.ts", entry: createEntry() })).resolves.toBe(true);
  });

  it("treats mismatching metadata as stale", async () => {
    const fs = {
      readFile: vi.fn(async () => {
        throw new Error("readFile should not be called");
      }),
      readFileBuffer: vi.fn(async () => {
        throw new Error("readFileBuffer should not be called");
      }),
      readJson: vi.fn(),
      exists: vi.fn(),
      glob: vi.fn(),
      stat: vi.fn(async () => ({
        isFile: true,
        isDirectory: false,
        size: 22,
        mtimeMs: 12
      })),
      writeFile: vi.fn(),
      rename: vi.fn()
    } satisfies FileSystem;

    const checker = createMetadataStaleChecker(fs);
    await expect(
      checker.isStale({
        path: "src/app.ts",
        entry: createEntry({
          metadata: {
            size: 21,
            mtimeMs: 12
          }
        })
      })
    ).resolves.toBe(true);
  });
});
