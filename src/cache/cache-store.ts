import type { CacheEntry, GraphCache } from "./cache-types.js";
import type { StaleChecker } from "./stale-checker.js";

export type GraphCacheStore = {
  getEntry: (path: string) => Promise<CacheEntry | null>;
  setEntry: (path: string, entry: CacheEntry) => void;
  entries: () => Record<string, CacheEntry>;
};

export const createGraphCacheStore = (
  cache: GraphCache | null,
  staleChecker: StaleChecker
): GraphCacheStore => {
  const entries = new Map<string, CacheEntry>(Object.entries(cache?.files ?? {}));

  return {
    getEntry: async (path) => {
      const entry = entries.get(path);

      if (entry === undefined) {
        return null;
      }

      if (await staleChecker.isStale({ path, entry }).catch(() => true)) {
        entries.delete(path);
        return null;
      }

      return entry;
    },
    setEntry: (path, entry) => {
      entries.set(path, entry);
    },
    entries: () => {
      return Object.fromEntries(entries);
    }
  };
};
