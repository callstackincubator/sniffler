import { createHash } from "node:crypto";
import type { FileSystem } from "../filesystem/filesystem.js";
import type { CacheEntry, SourceFileMetadata } from "./cache-types.js";

export type SourceFileFreshnessResult =
  | {
      status: "fresh";
      contentHash: string;
      metadata?: SourceFileMetadata;
    }
  | {
      status: "stale";
      contentHash: string;
      text: string;
      metadata?: SourceFileMetadata;
    };

export type SourceFileFreshness = {
  check: (path: string, cacheEntry?: CacheEntry) => Promise<SourceFileFreshnessResult>;
};

const hashBytes = (bytes: Uint8Array): string => {
  return createHash("sha256").update(bytes).digest("hex");
};

const readBuffer = async (fs: FileSystem, path: string): Promise<Uint8Array> => {
  return fs.readFileBuffer === undefined ? Buffer.from(await fs.readFile(path), "utf8") : await fs.readFileBuffer(path);
};

const readAndHash = async (
  fs: FileSystem,
  path: string,
  metadata?: SourceFileMetadata
): Promise<Extract<SourceFileFreshnessResult, { status: "stale" }>> => {
  const bytes = await readBuffer(fs, path);

  return {
    status: "stale",
    contentHash: hashBytes(bytes),
    text: Buffer.from(bytes).toString("utf8"),
    ...(metadata === undefined ? {} : { metadata })
  };
};

const readMetadata = async (fs: FileSystem, path: string): Promise<SourceFileMetadata> => {
  const stat = await fs.stat(path);

  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
};

const metadataMatches = (left: SourceFileMetadata, right: SourceFileMetadata): boolean => {
  return left.size === right.size && left.mtimeMs === right.mtimeMs;
};

export const createContentHashSourceFileFreshness = (fs: FileSystem): SourceFileFreshness => {
  return {
    check: async (path, cacheEntry) => {
      const result = await readAndHash(fs, path);

      if (cacheEntry !== undefined && cacheEntry.contentHash === result.contentHash) {
        return {
          status: "fresh",
          contentHash: result.contentHash
        };
      }

      return result;
    }
  };
};

export const createMetadataSourceFileFreshness = (fs: FileSystem): SourceFileFreshness => {
  return {
    check: async (path, cacheEntry) => {
      const metadata = await readMetadata(fs, path);

      if (cacheEntry?.metadata !== undefined && metadataMatches(metadata, cacheEntry.metadata)) {
        return {
          status: "fresh",
          contentHash: cacheEntry.contentHash,
          metadata
        };
      }

      return await readAndHash(fs, path, metadata);
    }
  };
};
