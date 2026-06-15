import type { FileSystem } from "../filesystem/filesystem.js";
import type { GraphCache } from "./cache-types.js";

export const saveCache = async (fs: FileSystem, path: string, cache: GraphCache): Promise<void> => {
  const tempPath = `${path}.tmp`;
  const serialized = `${JSON.stringify(cache, null, 2)}\n`;

  await fs.writeFile(tempPath, serialized);
  await fs.rename(tempPath, path);
};
