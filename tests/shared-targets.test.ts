import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { selectImpact } from "../src/impact/impact-command.js";

const createSharedTargetsFixtureFileSystem = (testMap: Record<string, unknown>) => {
  return createMemoryFileSystem({
    ".sniffler/config.json": JSON.stringify({
      source: {
        roots: ["src"],
        extensions: [".ts"],
        ignore: []
      },
      workspaces: {
        strategies: []
      },
      tests: {
        manifest: ".sniffler/test-map.json",
        sharedTargets: ["src/global.ts"]
      }
    }),
    ".sniffler/test-map.json": JSON.stringify(testMap),
    "src/global.ts": 'import "./some-other.ts";\nexport const global = true;\n',
    "src/some-other.ts": "export const someOther = true;\n",
    "src/alpha.ts": "export const alpha = true;\n",
    "src/beta.ts": "export const beta = true;\n"
  });
};

describe("sharedTargets", () => {
  it("selects every test through the shared target and keeps the dependency graph path", async () => {
    const fs = createSharedTargetsFixtureFileSystem({
      tests: [
        {
          test: "alpha.spec.ts",
          targets: ["src/alpha.ts"]
        },
        {
          test: "beta.spec.ts",
          targets: ["src/beta.ts"]
        }
      ]
    });

    const result = await selectImpact({ changedFiles: ["src/some-other.ts"] }, { fs, cwd: "." });

    expect(result.recommendedTests).toEqual([
      {
        test: "alpha.spec.ts",
        reasons: [
          {
            changedFile: "src/some-other.ts",
            declaredTarget: "src/global.ts",
            dependencyPath: ["src/some-other.ts", "src/global.ts"]
          }
        ]
      },
      {
        test: "beta.spec.ts",
        reasons: [
          {
            changedFile: "src/some-other.ts",
            declaredTarget: "src/global.ts",
            dependencyPath: ["src/some-other.ts", "src/global.ts"]
          }
        ]
      }
    ]);
  });

  it("dedupes shared targets that already exist on the test entry", async () => {
    const fs = createSharedTargetsFixtureFileSystem({
      tests: [
        {
          test: "alpha.spec.ts",
          targets: ["src/global.ts"]
        }
      ]
    });

    const result = await selectImpact({ changedFiles: ["src/some-other.ts"] }, { fs, cwd: "." });

    expect(result.recommendedTests).toEqual([
      {
        test: "alpha.spec.ts",
        reasons: [
          {
            changedFile: "src/some-other.ts",
            declaredTarget: "src/global.ts",
            dependencyPath: ["src/some-other.ts", "src/global.ts"]
          }
        ]
      }
    ]);
  });

  it("dedupes shared targets that normalize to an existing test target", async () => {
    const fs = createSharedTargetsFixtureFileSystem({
      tests: [
        {
          test: "alpha.spec.ts",
          targets: ["./src/global.ts"]
        }
      ]
    });

    const result = await selectImpact({ changedFiles: ["src/some-other.ts"] }, { fs, cwd: "." });

    expect(result.recommendedTests).toEqual([
      {
        test: "alpha.spec.ts",
        reasons: [
          {
            changedFile: "src/some-other.ts",
            declaredTarget: "./src/global.ts",
            dependencyPath: ["src/some-other.ts", "src/global.ts"]
          }
        ]
      }
    ]);
  });
});
