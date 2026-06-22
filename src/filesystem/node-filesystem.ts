import fg from "fast-glob";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createInvalidJsonError,
  type FileSystem,
  type FileStat,
  type GlobOptions
} from "./filesystem.js";
import { normalizePath } from "./path-utils.js";

const toFileStat = (fileStat: { isFile: () => boolean; isDirectory: () => boolean; size: number; mtimeMs: number }): FileStat => {
  return {
    isFile: fileStat.isFile(),
    isDirectory: fileStat.isDirectory(),
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs
  };
};

export const createNodeFileSystem = (): FileSystem => {
  const readFileInternal = async (path: string): Promise<string> => {
    return readFile(path, "utf8");
  };

  const buildPruneIgnorePatterns = (pruneDirectories: ReadonlyArray<string>): Array<string> => {
    const patterns = new Set<string>();

    for (const directory of pruneDirectories) {
      const normalizedDirectory = normalizePath(directory).replace(/^\.\/+/, "");

      if (normalizedDirectory.length === 0) {
        continue;
      }

      patterns.add(`**/${normalizedDirectory}/**`);
      patterns.add(`${normalizedDirectory}/**`);
    }

    return [...patterns];
  };

  return {
    readFile: readFileInternal,
    readFileBuffer: async (path: string) => {
      return readFile(path);
    },
    readJson: async <T>(path: string) => {
      const text = await readFileInternal(path);

      try {
        return JSON.parse(text) as T;
      } catch (cause) {
        throw createInvalidJsonError(path, cause);
      }
    },
    exists: async (path: string) => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    glob: async (patterns: ReadonlyArray<string>, options: GlobOptions) => {
      const cwd = resolve(options.cwd ?? ".");
      const pruneDirectories = options.pruneDirectories ?? [];
      const entries = await fg.async([...patterns], {
        cwd,
        dot: options.dot === true,
        followSymbolicLinks: false,
        ignore: [...(options.ignore ?? []), ...buildPruneIgnorePatterns(pruneDirectories)],
        onlyFiles: true
      });

      return entries.map((path) => normalizePath(path)).sort((left, right) => left.localeCompare(right));
    },
    stat: async (path: string) => toFileStat(await stat(path)),
    writeFile: async (path: string, content: string) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },
    rename: async (from: string, to: string) => {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    }
  };
};
