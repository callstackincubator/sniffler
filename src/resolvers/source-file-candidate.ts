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

const probeSourceExtensions = async (
  fs: FileSystem,
  candidate: string,
  sourceExtensions: ReadonlyArray<string>,
  platform: string
): Promise<string | undefined> => {
  for (const extension of sourceExtensions) {
    const platformCandidate = await probeFile(fs, `${candidate}.${platform}${extension}`);
    if (platformCandidate !== undefined) {
      return platformCandidate;
    }

    const nativeCandidate = await probeFile(fs, `${candidate}.native${extension}`);
    if (nativeCandidate !== undefined) {
      return nativeCandidate;
    }

    const genericCandidate = await probeFile(fs, `${candidate}${extension}`);
    if (genericCandidate !== undefined) {
      return genericCandidate;
    }
  }

  return undefined;
};

const probeIndexExtensions = async (
  fs: FileSystem,
  candidate: string,
  sourceExtensions: ReadonlyArray<string>,
  platform: string
): Promise<string | undefined> => {
  for (const extension of sourceExtensions) {
    const platformCandidate = await probeFile(fs, `${candidate}/index.${platform}${extension}`);
    if (platformCandidate !== undefined) {
      return platformCandidate;
    }

    const nativeCandidate = await probeFile(fs, `${candidate}/index.native${extension}`);
    if (nativeCandidate !== undefined) {
      return nativeCandidate;
    }

    const genericCandidate = await probeFile(fs, `${candidate}/index${extension}`);
    if (genericCandidate !== undefined) {
      return genericCandidate;
    }
  }

  return undefined;
};

export const resolveSourceFileCandidate = async (
  candidate: string,
  context: {
    fs: FileSystem;
    sourceExtensions?: ReadonlyArray<string>;
    platform?: string;
  }
): Promise<string | undefined> => {
  const normalizedCandidate = normalizePath(candidate);
  const extensions = context.sourceExtensions ?? defaultSourceExtensions;
  const platform = context.platform?.trim();

  const exactMatch = await probeFile(context.fs, normalizedCandidate);
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  if (platform !== undefined && platform.length > 0) {
    const platformMatch = await probeSourceExtensions(context.fs, normalizedCandidate, extensions, platform);
    if (platformMatch !== undefined) {
      return platformMatch;
    }

    return probeIndexExtensions(context.fs, normalizedCandidate, extensions, platform);
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
