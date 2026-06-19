import { describe, expect, it, vi } from "vitest";
import type { CacheEntry } from "../src/cache/cache-types.js";
import { createGraphCacheStore } from "../src/cache/cache-store.js";

const createEntry = (input: Partial<CacheEntry> = {}): CacheEntry => {
  return {
    path: "src/app.ts",
    contentHash: "abc",
    scan: {
      imports: [],
      exports: [],
      warnings: []
    },
    resolvedEdges: [],
    ...input
  };
};

describe("graph cache store", () => {
  it("returns entries when stale checker says they are fresh", async () => {
    const staleChecker = {
      isStale: vi.fn(async () => false)
    };
    const store = createGraphCacheStore(
      {
        version: 1,
        configHash: "hash",
        scannerVersion: "scanner",
        files: {
          "src/app.ts": createEntry()
        }
      },
      staleChecker
    );

    await expect(store.getEntry("src/app.ts")).resolves.toEqual(createEntry());
    expect(staleChecker.isStale).toHaveBeenCalledTimes(1);
  });

  it("purges stale entries after a stale read", async () => {
    const staleChecker = {
      isStale: vi.fn(async () => true)
    };
    const store = createGraphCacheStore(
      {
        version: 1,
        configHash: "hash",
        scannerVersion: "scanner",
        files: {
          "src/app.ts": createEntry()
        }
      },
      staleChecker
    );

    await expect(store.getEntry("src/app.ts")).resolves.toBeNull();
    await expect(store.getEntry("src/app.ts")).resolves.toBeNull();
    expect(staleChecker.isStale).toHaveBeenCalledTimes(1);
  });

  it("returns null for missing entries", async () => {
    const staleChecker = {
      isStale: vi.fn(async () => false)
    };
    const store = createGraphCacheStore(null, staleChecker);

    await expect(store.getEntry("src/app.ts")).resolves.toBeNull();
    expect(staleChecker.isStale).not.toHaveBeenCalled();
  });
});
