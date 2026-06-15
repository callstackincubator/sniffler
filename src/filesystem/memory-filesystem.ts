import {
  createInvalidJsonError,
  type FileStat,
  type FileSystem,
  type GlobOptions
} from "./filesystem.js";
import {
  createGlobMatcher,
  isPathWithinDirectory,
  normalizePath,
  parentDirectories
} from "./path-utils.js";

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
      const matchers = patterns.map((pattern) => createGlobMatcher(pattern));

      return Array.from(files.entries())
        .filter(([, entry]) => entry.kind === "file")
        .map(([path]) => normalizePath(path))
        .map((path) => (cwd === "." ? path : path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : ""))
        .filter((path) => path.length > 0)
        .filter((path) => (options.dot === true ? true : !path.split("/").some((segment) => segment.startsWith("."))))
        .filter((path) => matchers.some((matcher) => matcher(path)))
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
