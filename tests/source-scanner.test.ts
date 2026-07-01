import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { createNodeFileSystem } from "../src/filesystem/node-filesystem.js";
import { resolveSourceScanner } from "../src/scanner/source-scanner.js";

describe("resolveSourceScanner", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("uses the serial scanner for small miss counts", async () => {
    const fs = createMemoryFileSystem({
      "src/app.ts": [
        'import "./shared";',
        "export const app = 1;"
      ].join("\n"),
      "src/shared.ts": "export const shared = true;"
    });

    const scanner = resolveSourceScanner({
      fs,
      cwd: ".",
      workers: "auto",
      missCount: 1
    });

    expect(scanner.mode).toBe("serial");
    expect(scanner.workers).toBe(0);

    const [result] = await scanner.scan(["src/app.ts"]);

    expect(result).toMatchObject({
      path: "src/app.ts",
      contentHash: expect.any(String),
      metadata: {
        size: [
          'import "./shared";',
          "export const app = 1;"
        ].join("\n").length,
        mtimeMs: 0
      }
    });
    expect(result.scan.imports).toHaveLength(1);
  });

  it("uses the worker scanner for Node FS and preserves input order", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sniffler-worker-scan-"));
    const root = tempDir;
    const fs = createNodeFileSystem();

    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/a.ts"), 'import "./b";\nexport const a = 1;\n');
    await writeFile(join(root, "src/b.ts"), "export const b = 2;\n");

    const scanner = resolveSourceScanner({
      fs,
      cwd: root,
      workers: 1,
      missCount: 2
    });

    expect(scanner.mode).toBe("worker");
    expect(scanner.workers).toBe(1);

    const results = await scanner.scan(["src/b.ts", "src/a.ts"]);

    expect(results.map((result) => result.path)).toEqual(["src/b.ts", "src/a.ts"]);
    expect(results[0].scan.imports).toHaveLength(0);
    expect(results[1].scan.imports).toHaveLength(1);
    expect(results[1].metadata).toMatchObject({
      size: expect.any(Number),
      mtimeMs: expect.any(Number)
    });
  });

  it("rejects explicit worker scanning on unsupported file systems", () => {
    const fs = createMemoryFileSystem({
      "src/app.ts": "export const app = 1;"
    });

    expect(() =>
      resolveSourceScanner({
        fs,
        cwd: ".",
        workers: 1,
        missCount: 1
      })
    ).toThrow("Selected worker source scanner requires FileSystem.supportsWorkerScanning = true");
  });
});
