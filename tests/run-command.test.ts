import { describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { runRunCommand } from "../src/run/run-command.js";

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

describe("runRunCommand", () => {
  it("appends selected tests to the runner args", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));

    const result = await runRunCommand(
      {
        changedFiles: ["src/shared.ts"],
        command: "pnpm",
        args: ["vitest", "run"]
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(runner).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["vitest", "run", "e2e/feature.spec.ts"],
      cwd: expect.any(String)
    });
  });

  it("returns the runner exit code", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 7 }));

    const result = await runRunCommand(
      {
        changedFiles: ["src/shared.ts"],
        command: "pnpm",
        args: ["vitest", "run"]
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(7);
  });

  it("skips the runner when no tests are mapped", async () => {
    const fs = createFixtureFileSystem(["src/unrelated.ts"]);
    const runner = vi.fn(async () => ({ exitCode: 0 }));

    const result = await runRunCommand(
      {
        changedFiles: ["src/shared.ts"],
        command: "pnpm",
        args: ["vitest", "run"]
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(runner).not.toHaveBeenCalled();
  });
});
