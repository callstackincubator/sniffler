import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeFileSystem } from "../src/filesystem/node-filesystem.js";

const writeFixture = async (root: string, entries: Record<string, string>) => {
  const fs = createNodeFileSystem();

  for (const [path, content] of Object.entries(entries)) {
    await fs.writeFile(join(root, path), content);
  }
};

describe("createNodeFileSystem glob pruning", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("respects ignore patterns, dot filtering, and deterministic sorting", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sniffler-fs-"));
    const root = tempDir;
    const fs = createNodeFileSystem();

    await writeFixture(root, {
      "app.ts": "export const root = true;\n",
      "app.test.ts": "export const ignored = true;\n",
      "src/.hidden.ts": "export const hidden = true;\n",
      "src/b.ts": "export const b = true;\n",
      "src/a.ts": "export const a = true;\n",
      "src/nested/feature.ts": "export const feature = true;\n",
      "src/app.ts": "export const app = 1;\n"
    });

    await expect(
      fs.glob(["**/*.ts"], {
        cwd: root,
        dot: false,
        ignore: ["**/*.test.ts"]
      })
    ).resolves.toEqual(["app.ts", "src/a.ts", "src/app.ts", "src/b.ts", "src/nested/feature.ts"]);

    await expect(fs.glob(["src/**.ts"], { cwd: root, dot: false })).resolves.toEqual([
      "src/a.ts",
      "src/app.ts",
      "src/b.ts"
    ]);

    await expect(fs.glob(["src/**/*.ts"], { cwd: root, dot: false })).resolves.toEqual([
      "src/a.ts",
      "src/app.ts",
      "src/b.ts",
      "src/nested/feature.ts"
    ]);
  });

  it("prunes node_modules unless pruning is disabled", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sniffler-fs-"));
    const root = tempDir;
    const fs = createNodeFileSystem();

    await writeFixture(root, {
      "nested/a/helper.ts": "export const helper = true;\n",
      "nested/a/node_modules/pkg/nested.ts": "export const nested = true;\n",
      "node_modules/pkg/index.ts": "export const pkg = true;\n",
      "src/app.ts": "export const app = 1;\n"
    });

    await expect(fs.glob(["**/*.ts"], { cwd: root, dot: true, pruneDirectories: ["node_modules"] })).resolves.toEqual([
      "nested/a/helper.ts",
      "src/app.ts"
    ]);

    await expect(fs.glob(["**/*.ts"], { cwd: root, dot: true, pruneDirectories: [] })).resolves.toEqual([
      "nested/a/helper.ts",
      "nested/a/node_modules/pkg/nested.ts",
      "node_modules/pkg/index.ts",
      "src/app.ts"
    ]);
  });
});
