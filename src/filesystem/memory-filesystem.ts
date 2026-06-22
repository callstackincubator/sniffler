import { createRequire } from "node:module";
import {
  createInvalidJsonError,
  type FileStat,
  type FileSystem,
  type GlobOptions
} from "./filesystem.js";
import { isPathWithinDirectory, normalizePath, parentDirectories } from "./path-utils.js";

type Picomatch = (pattern: string, options?: { dot?: boolean }) => (path: string) => boolean;

const picomatch = createRequire(import.meta.url)("picomatch") as Picomatch;

type MemoryEntry = {
  content: string;
  kind: "file" | "directory";
};

const createDirectoryEntry = (): MemoryEntry => {
  return {
    content: "",
    kind: "directory"
  };
};

const defaultStat = (kind: MemoryEntry["kind"], content: string): FileStat => {
  return {
    isFile: kind === "file",
    isDirectory: kind === "directory",
    size: content.length,
    mtimeMs: 0
  };
};

const createMatcher = (pattern: string, dot: boolean): ((path: string) => boolean) => {
  return picomatch(normalizePath(pattern), { dot });
};

export type MemoryFileSystem = FileSystem & {
  seed: (entries: Record<string, string>) => void;
};

export const createMemoryFileSystem = (entries: Record<string, string> = {}): MemoryFileSystem => {
  const files = new Map<string, MemoryEntry>();

  const ensureDirectoryEntries = (path: string) => {
    for (const directory of parentDirectories(path)) {
      if (!files.has(directory)) {
        files.set(directory, createDirectoryEntry());
      }
    }
  };

  const setFile = (path: string, content: string) => {
    const normalizedPath = normalizePath(path);
    ensureDirectoryEntries(normalizedPath);
    files.set(normalizedPath, { content, kind: "file" });
  };

  const seed = (nextEntries: Record<string, string>) => {
    files.clear();

    for (const [path, content] of Object.entries(nextEntries)) {
      setFile(path, content);
    }
  };

  seed(entries);

  const getEntry = (path: string): MemoryEntry | undefined => {
    const normalizedPath = normalizePath(path);

    if (files.has(normalizedPath)) {
      return files.get(normalizedPath);
    }

    if ((normalizedPath === "." || normalizedPath === "/") && files.size > 0) {
      return createDirectoryEntry();
    }

    if (Array.from(files.keys()).some((candidate) => isPathWithinDirectory(candidate, normalizedPath))) {
      return createDirectoryEntry();
    }

    return undefined;
  };

  const readFileInternal = async (path: string): Promise<string> => {
    const entry = getEntry(path);

    if (entry === undefined || entry.kind !== "file") {
      throw new Error(`File not found: ${path}`);
    }

    return entry.content;
  };

  return {
    seed,
    readFile: readFileInternal,
    readFileBuffer: async (path: string) => {
      return Buffer.from(await readFileInternal(path), "utf8");
    },
    readJson: async <T>(path: string) => {
      const text = await readFileInternal(path);
      try {
        return JSON.parse(text ?? "") as T;
      } catch (cause) {
        throw createInvalidJsonError(path, cause);
      }
    },
    exists: async (path: string) => getEntry(path) !== undefined,
    glob: async (patterns: ReadonlyArray<string>, options: GlobOptions) => {
      const cwd = normalizePath(options.cwd ?? ".");
      const pruneDirectories = options.pruneDirectories ?? [];
      const ignorePatterns = options.ignore ?? [];
      const dot = options.dot === true;
      const matchers = patterns.map((pattern) => createMatcher(pattern, dot));
      const ignoreMatchers = ignorePatterns.map((pattern) => createMatcher(pattern, dot));

      return Array.from(files.entries())
        .filter(([, entry]) => entry.kind === "file")
        .map(([path]) => normalizePath(path))
        .map((path) => (cwd === "." ? path : path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : ""))
        .filter((path) => path.length > 0)
        .filter((path) => (dot ? true : !path.split("/").some((segment) => segment.startsWith("."))))
        .filter((path) => !pruneDirectories.some((directory) => path.split("/").includes(directory)))
        .filter((path) => matchers.some((matcher) => matcher(path)))
        .filter((path) => !ignoreMatchers.some((matcher) => matcher(path)))
        .sort((left, right) => left.localeCompare(right));
    },
    stat: async (path: string) => {
      const entry = getEntry(path);

      if (entry === undefined) {
        throw new Error(`Path not found: ${path}`);
      }

      return defaultStat(entry.kind, entry.content);
    },
    writeFile: async (path: string, content: string) => {
      setFile(path, content);
    },
    rename: async (from: string, to: string) => {
      const normalizedFrom = normalizePath(from);
      const normalizedTo = normalizePath(to);
      const entry = files.get(normalizedFrom);

      if (entry === undefined || entry.kind !== "file") {
        throw new Error(`File not found: ${from}`);
      }

      files.delete(normalizedFrom);
      setFile(normalizedTo, entry.content);
    }
  };
};
