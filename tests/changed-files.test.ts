import { describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { resolveChangedFiles } from "../src/impact/changed-files.js";
import {
  resolveRunAllReasons,
  selectRunAllTests
} from "../src/test-map/recommend-tests.js";

describe("impact changed-files helpers", () => {
  it("normalizes and deduplicates explicit changed files", async () => {
    const result = await resolveChangedFiles(
      {
        changedFiles: ["src/app.ts", "./src/app.ts", "src/feature.ts"]
      },
      {},
      "."
    );

    expect(result).toEqual(["src/app.ts", "src/feature.ts"]);
  });

  it("uses git diff when explicit files are missing", async () => {
    const gitDiff = vi.fn(async () => ["src/feature.ts", "src/app.ts", "src/app.ts"]);

    const result = await resolveChangedFiles(
      {
        base: "origin/main"
      },
      {
        gitDiff
      },
      "."
    );

    expect(gitDiff).toHaveBeenCalledWith({
      base: "origin/main",
      head: "HEAD",
      cwd: "."
    });
    expect(result).toEqual(["src/app.ts", "src/feature.ts"]);
  });

  it("builds run-all selection from manifest", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/test-map.json": JSON.stringify([
        {
          test: "e2e/app.spec.ts",
          dependsOn: ["src/app.ts"]
        },
        {
          test: "e2e/feature.spec.ts",
          dependsOn: ["src/feature.ts"]
        }
      ])
    });

    const reasons = resolveRunAllReasons(["pnpm-lock.yaml"], ["pnpm-lock.yaml"]);
    const testMap = await fs.readJson<Array<{ test: string; dependsOn: Array<string> }>>(
      ".sniffler/test-map.json"
    );

    expect(selectRunAllTests(
      testMap.map((entry) => ({
        test: entry.test,
        dependsOn: entry.dependsOn
      })),
      reasons
    )).toEqual([
      {
        test: "e2e/app.spec.ts",
        reasons: [
          {
            kind: "run-all",
            changedFile: "pnpm-lock.yaml",
            declaredTarget: "pnpm-lock.yaml"
          }
        ]
      },
      {
        test: "e2e/feature.spec.ts",
        reasons: [
          {
            kind: "run-all",
            changedFile: "pnpm-lock.yaml",
            declaredTarget: "pnpm-lock.yaml"
          }
        ]
      }
    ]);
  });
});
