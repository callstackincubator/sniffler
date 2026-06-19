import { createHash } from "node:crypto";
import type { CacheEntry, SourceFileMetadata } from "./cache-types.js";
import type { FileSystem } from "../filesystem/filesystem.js";

export type StaleChecker = {
  isStale: (input: { path: string; entry: CacheEntry }) => Promise<boolean>;
};

const hashBytes = (bytes: Uint8Array): string => {
  return createHash("sha256").update(bytes).digest("hex");
};

const readBytes = async (fs: FileSystem, path: string): Promise<Uint8Array> => {
  if (fs.readFileBuffer !== undefined) {
    return await fs.readFileBuffer(path);
  }

  return Buffer.from(await fs.readFile(path), "utf8");
};

export const readSourceFileMetadata = async (fs: FileSystem, path: string): Promise<SourceFileMetadata> => {
  const stat = await fs.stat(path);

  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
};

const metadataMatches = (left: SourceFileMetadata, right: SourceFileMetadata): boolean => {
  return left.size === right.size && left.mtimeMs === right.mtimeMs;
};

export const createContentHashStaleChecker = (fs: FileSystem): StaleChecker => {
  return {
    isStale: async ({ path, entry }) => {
      try {
        const bytes = await readBytes(fs, path);
        return hashBytes(bytes) !== entry.contentHash;
      } catch {
        return true;
      }
    }
  };
};

export const createMetadataStaleChecker = (fs: FileSystem): StaleChecker => {
  return {
    isStale: async ({ path, entry }) => {
      if (entry.metadata === undefined) {
        return true;
      }

      try {
        const metadata = await readSourceFileMetadata(fs, path);
        return !metadataMatches(metadata, entry.metadata);
      } catch {
        return true;
      }
    }
  };
};
