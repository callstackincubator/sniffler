import { describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { createSniffler } from "../src/create-sniffler.js";
import { runCli } from "../src/cli.js";

const createFixtureFileSystem = (testMapTargets: ReadonlyArray<string> = ["src/feature.ts"]) => {
  return createMemoryFileSystem({
    ".sniffler/config.json": JSON.stringify({
      output: {
        format: "text"
      },
      tests: {
        manifest: ".sniffler/test-map.json"
      }
    }),
    ".sniffler/test-map.json": JSON.stringify({
      tests: [
        {
          test: "e2e/feature.spec.ts",
          targets: testMapTargets
        }
      ]
    }),
    "src/feature.ts": [
      'import "./shared.ts";',
      "export const feature = true;"
    ].join("\n"),
    "src/shared.ts": "export const shared = true;"
  });
};

describe("CLI impact command", () => {
  it("renders text output for changed files", async () => {
    const fs = createFixtureFileSystem();
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--changed", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Changed files:");
    expect(output.join("")).toContain("src/shared.ts");
    expect(output.join("")).toContain("Recommended E2E tests:");
    expect(output.join("")).toContain("e2e/feature.spec.ts");
    expect(output.join("")).toContain("path: src/shared.ts -> src/feature.ts");
  });

  it("renders JSON output for base/head mode", async () => {
    const fs = createFixtureFileSystem();
    const gitDiff = vi.fn(async () => ["src/shared.ts"]);
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--base", "origin/main", "--head", "HEAD", "--format", "json"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: ".", gitDiff }
    );

    expect(result.exitCode).toBe(0);
    expect(gitDiff).toHaveBeenCalledWith({
      base: "origin/main",
      head: "HEAD",
      cwd: expect.any(String)
    });

    expect(JSON.parse(output.join(""))).toEqual({
      changedFiles: ["src/shared.ts"],
      affectedModules: ["src/feature.ts", "src/shared.ts"],
      recommendedTests: [
        {
          test: "e2e/feature.spec.ts",
          reasons: [
            {
              changedFile: "src/shared.ts",
              declaredTarget: "src/feature.ts",
              dependencyPath: ["src/shared.ts", "src/feature.ts"]
            }
          ]
        }
      ],
      warnings: []
    });
  });

  it("exits successfully when no tests are mapped", async () => {
    const fs = createFixtureFileSystem(["src/unrelated.ts"]);
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--changed", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Recommended E2E tests:");
    expect(output.join("")).toContain("none");
  });

  it("exposes the impact API from the top-level factory", async () => {
    const fs = createFixtureFileSystem();
    const sniffler = createSniffler({ fs, cwd: "." });

    const result = await sniffler.impact({
      changedFiles: ["src/shared.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("e2e/feature.spec.ts");
  });
});
