import type { FileSystem } from "../filesystem/filesystem.js";
import type { GraphCache } from "./cache-types.js";

export const loadCache = async (_fs: FileSystem, _path: string): Promise<GraphCache | null> => {
  return null;
};
