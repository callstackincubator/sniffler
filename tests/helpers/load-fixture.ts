import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryFileSystem, type MemoryFileSystem } from "../../src/filesystem/memory-filesystem.js";

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

const normalizeFixturePath = (path: string): string => {
  return path.split(sep).join("/");
};

const collectFixtureEntries = async (
  directory: string,
  rootDirectory: string = directory,
  entries: Record<string, string> = {}
): Promise<Record<string, string>> => {
  const children = await readdir(directory, { withFileTypes: true });

  for (const child of children) {
    const absolutePath = resolve(directory, child.name);

    if (child.isDirectory()) {
      await collectFixtureEntries(absolutePath, rootDirectory, entries);
      continue;
    }

    const relativePath = normalizeFixturePath(absolutePath.slice(rootDirectory.length + 1));
    entries[relativePath] = await readFile(absolutePath, "utf8");
  }

  return entries;
};

export const loadFixtureFileSystem = async (fixtureName: string): Promise<MemoryFileSystem> => {
  const fixtureDirectory = resolve(fixturesRoot, fixtureName);
  const entries = await collectFixtureEntries(fixtureDirectory);
  return createMemoryFileSystem(entries);
};
