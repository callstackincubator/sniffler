import { readFile, rename, stat, writeFile } from "node:fs/promises";
import type { FileSystem, FileStat, GlobOptions } from "./filesystem.js";

const toFileStat = (fileStat: { isFile: () => boolean; isDirectory: () => boolean; size: number; mtimeMs: number }): FileStat => {
  return {
    isFile: fileStat.isFile(),
    isDirectory: fileStat.isDirectory(),
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs
  };
};

export const createNodeFileSystem = (): FileSystem => {
  return {
    readFile: async (path: string) => readFile(path, "utf8"),
    readJson: async <T>(path: string) => JSON.parse(await readFile(path, "utf8")) as T,
    exists: async (_path: string) => {
      return false;
    },
    glob: async (_patterns: ReadonlyArray<string>, _options: GlobOptions) => {
      return [];
    },
    stat: async (path: string) => toFileStat(await stat(path)),
    writeFile: async (path: string, content: string) => {
      await writeFile(path, content, "utf8");
    },
    rename: async (from: string, to: string) => {
      await rename(from, to);
    }
  };
};
