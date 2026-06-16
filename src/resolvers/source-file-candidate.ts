import type { FileSystem } from "../filesystem/filesystem.js";
import { normalizePath } from "../filesystem/path-utils.js";

const defaultSourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

const statIfFile = async (fs: FileSystem, path: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
};

const probeFile = async (fs: FileSystem, path: string): Promise<string | undefined> => {
  const normalizedPath = normalizePath(path);
  return (await statIfFile(fs, normalizedPath)) ? normalizedPath : undefined;
};

export const resolveSourceFileCandidate = async (
  candidate: string,
  context: {
    fs: FileSystem;
    sourceExtensions?: ReadonlyArray<string>;
  }
): Promise<string | undefined> => {
  const normalizedCandidate = normalizePath(candidate);
  const extensions = context.sourceExtensions ?? defaultSourceExtensions;

  const exactMatch = await probeFile(context.fs, normalizedCandidate);
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  for (const extension of extensions) {
    const resolved = await probeFile(context.fs, `${normalizedCandidate}${extension}`);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  for (const extension of extensions) {
    const resolved = await probeFile(context.fs, `${normalizedCandidate}/index${extension}`);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
};
