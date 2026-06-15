import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInvalidJsonError,
  isSnifflerInvalidJsonError
} from "../src/filesystem/filesystem.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { createNodeFileSystem } from "../src/filesystem/node-filesystem.js";

const readInvalidJsonError = async (readJson: () => Promise<unknown>) => {
  try {
    await readJson();
    throw new Error("Expected readJson to throw");
  } catch (error) {
    return error;
  }
};

describe("createMemoryFileSystem", () => {
  it("supports file operations, directory stats, globbing, and typed JSON errors", async () => {
    const fs = createMemoryFileSystem({
      "src/app.ts": "export const app = 1;\n",
      "src/config.json": "{\"enabled\":true}",
      "src/broken.json": "{"
    });

    expect(await fs.exists("src/app.ts")).toBe(true);
    expect(await fs.exists("src")).toBe(true);

    expect(await fs.stat("src/app.ts")).toMatchObject({
      isFile: true,
      isDirectory: false,
      size: "export const app = 1;\n".length
    });

    expect(await fs.stat("src")).toMatchObject({
      isFile: false,
      isDirectory: true
    });

    expect(await fs.glob(["**/*.ts"], { cwd: ".", dot: false })).toEqual(["src/app.ts"]);

    await fs.writeFile("src/new-file.ts", "export const newFile = true;\n");
    expect(await fs.exists("src/new-file.ts")).toBe(true);

    await fs.rename("src/app.ts", "src/app-renamed.ts");
    expect(await fs.exists("src/app.ts")).toBe(false);
    expect(await fs.exists("src/app-renamed.ts")).toBe(true);

    await expect(fs.readJson<{ enabled: boolean }>("src/config.json")).resolves.toEqual({
      enabled: true
    });

    const error = await readInvalidJsonError(() => fs.readJson("src/broken.json"));
    expect(isSnifflerInvalidJsonError(error)).toBe(true);
    expect(error).toMatchObject({
      code: "SNIFFLER_INVALID_JSON",
      path: "src/broken.json"
    });
  });

  it("creates a reusable typed error object", () => {
    const error = createInvalidJsonError("src/config.json", new SyntaxError("Unexpected token"));

    expect(isSnifflerInvalidJsonError(error)).toBe(true);
    expect(error.message).toContain("src/config.json");
  });
});

describe("createNodeFileSystem", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("supports file operations, directory stats, globbing, and typed JSON errors", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sniffler-fs-"));
    const root = tempDir;

    if (root === null) {
      throw new Error("Expected temporary directory to be initialized");
    }

    const fs = createNodeFileSystem();

    await fs.writeFile(join(root, "src/app.ts"), "export const app = 1;\n");
    await fs.writeFile(join(root, "src/config.json"), "{\"enabled\":true}");
    await fs.writeFile(join(root, "src/broken.json"), "{");

    expect(await fs.exists(join(root, "src/app.ts"))).toBe(true);
    expect(await fs.exists(join(root, "src"))).toBe(true);

    expect(await fs.stat(join(root, "src/app.ts"))).toMatchObject({
      isFile: true,
      isDirectory: false,
      size: "export const app = 1;\n".length
    });

    expect(await fs.stat(join(root, "src"))).toMatchObject({
      isFile: false,
      isDirectory: true
    });

    expect(await fs.glob(["**/*.ts"], { cwd: root, dot: false })).toEqual(["src/app.ts"]);

    await fs.writeFile(join(root, "src/new-file.ts"), "export const newFile = true;\n");
    expect(await fs.exists(join(root, "src/new-file.ts"))).toBe(true);

    await fs.rename(join(root, "src/app.ts"), join(root, "src/app-renamed.ts"));
    expect(await fs.exists(join(root, "src/app.ts"))).toBe(false);
    expect(await fs.exists(join(root, "src/app-renamed.ts"))).toBe(true);

    await expect(fs.readJson<{ enabled: boolean }>(join(root, "src/config.json"))).resolves.toEqual({
      enabled: true
    });

    const error = await readInvalidJsonError(() => fs.readJson(join(root, "src/broken.json")));
    expect(isSnifflerInvalidJsonError(error)).toBe(true);
    expect(error).toMatchObject({
      code: "SNIFFLER_INVALID_JSON",
      path: join(root, "src/broken.json")
    });
  });
});
