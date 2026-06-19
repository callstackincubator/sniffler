import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  createInvalidJsonError,
  type FileSystem,
  type FileStat,
  type GlobOptions
} from "./filesystem.js";
import { createGlobMatcher, normalizePath } from "./path-utils.js";

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

  const walkFiles = async (root: string): Promise<Array<string>> => {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(root, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await walkFiles(fullPath)));
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
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
      const matchers = patterns.map((pattern) => createGlobMatcher(pattern));

      return (await walkFiles(cwd))
        .map((path) => relative(cwd, path))
        .map((path) => normalizePath(path))
        .filter((path) => path.length > 0)
        .filter((path) => (options.dot === true ? true : !path.split("/").some((segment) => segment.startsWith("."))))
        .filter((path) => matchers.some((matcher) => matcher(path)))
        .sort((left, right) => left.localeCompare(right));
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
