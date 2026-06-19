import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CacheEntry } from "../src/cache/cache-types.js";
import {
  createContentHashSourceFileFreshness,
  createMetadataSourceFileFreshness
} from "../src/cache/source-file-freshness.js";
import type { FileSystem } from "../src/filesystem/filesystem.js";

const hash = (text: string): string => {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
};

const createCacheEntry = (input: Partial<CacheEntry> = {}): CacheEntry => {
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

describe("source file freshness", () => {
  it("checks content hashes from buffers without reading text on cache hits", async () => {
    const fs = {
      readFile: vi.fn(async () => {
        throw new Error("readFile should not be called");
      }),
      readFileBuffer: vi.fn(async () => Buffer.from("export const app = 1;", "utf8")),
      readJson: vi.fn(),
      exists: vi.fn(),
      glob: vi.fn(),
      stat: vi.fn(),
      writeFile: vi.fn(),
      rename: vi.fn()
    } satisfies FileSystem;

    const freshness = createContentHashSourceFileFreshness(fs);
    const result = await freshness.check("src/app.ts", createCacheEntry());

    expect(result).toEqual({
      status: "fresh",
      contentHash: hash("export const app = 1;")
    });
    expect(fs.readFileBuffer).toHaveBeenCalledWith("src/app.ts");
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("returns decoded text when content hash freshness misses", async () => {
    const fs = {
      readFile: vi.fn(async () => {
        throw new Error("readFile should not be called");
      }),
      readFileBuffer: vi.fn(async () => Buffer.from("export const app = 2;", "utf8")),
      readJson: vi.fn(),
      exists: vi.fn(),
      glob: vi.fn(),
      stat: vi.fn(),
      writeFile: vi.fn(),
      rename: vi.fn()
    } satisfies FileSystem;

    const freshness = createContentHashSourceFileFreshness(fs);
    const result = await freshness.check("src/app.ts", createCacheEntry());

    expect(result).toEqual({
      status: "stale",
      contentHash: hash("export const app = 2;"),
      text: "export const app = 2;"
    });
  });

  it("can trust matching metadata without reading file contents", async () => {
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

    const freshness = createMetadataSourceFileFreshness(fs);
    const result = await freshness.check(
      "src/app.ts",
      createCacheEntry({
        metadata: {
          size: 21,
          mtimeMs: 12
        }
      })
    );

    expect(result).toEqual({
      status: "fresh",
      contentHash: hash("export const app = 1;"),
      metadata: {
        size: 21,
        mtimeMs: 12
      }
    });
    expect(fs.stat).toHaveBeenCalledWith("src/app.ts");
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.readFileBuffer).not.toHaveBeenCalled();
  });
});
