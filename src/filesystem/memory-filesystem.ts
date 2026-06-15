import type { FileStat, FileSystem, GlobOptions } from "./filesystem.js";

type MemoryEntry = {
  content: string;
  kind: "file" | "directory";
};

const defaultStat = (kind: MemoryEntry["kind"], content: string): FileStat => {
  return {
    isFile: kind === "file",
    isDirectory: kind === "directory",
    size: content.length,
    mtimeMs: 0
  };
};

export type MemoryFileSystem = FileSystem & {
  seed: (entries: Record<string, string>) => void;
};

export const createMemoryFileSystem = (entries: Record<string, string> = {}): MemoryFileSystem => {
  const files = new Map<string, MemoryEntry>();

  const seed = (nextEntries: Record<string, string>) => {
    files.clear();

    for (const [path, content] of Object.entries(nextEntries)) {
      files.set(path, { content, kind: "file" });
    }
  };

  seed(entries);

  return {
    seed,
    readFile: async (path: string) => {
      const entry = files.get(path);

      if (entry === undefined || entry.kind !== "file") {
        throw new Error(`File not found: ${path}`);
      }

      return entry.content;
    },
    readJson: async <T>(path: string) => JSON.parse(await Promise.resolve((await files.get(path))?.content ?? "")) as T,
    exists: async (path: string) => files.has(path),
    glob: async (_patterns: ReadonlyArray<string>, _options: GlobOptions) => {
      return Array.from(files.keys());
    },
    stat: async (path: string) => {
      const entry = files.get(path);

      if (entry === undefined) {
        throw new Error(`Path not found: ${path}`);
      }

      return defaultStat(entry.kind, entry.content);
    },
    writeFile: async (path: string, content: string) => {
      files.set(path, { content, kind: "file" });
    },
    rename: async (from: string, to: string) => {
      const entry = files.get(from);

      if (entry === undefined) {
        throw new Error(`File not found: ${from}`);
      }

      files.delete(from);
      files.set(to, entry);
    }
  };
};
