import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFileText } from "../src/scanner/scan-file.js";
import { discoverWorkspaces } from "../src/workspaces/discover-workspaces.js";
import { packageJsonWorkspacesStrategy } from "../src/workspaces/package-json-workspaces.js";
import { loadFixtureFileSystem } from "./helpers/load-fixture.js";

type RunFixtureCliInput = {
  fixture: string;
  argv: ReadonlyArray<string>;
  gitDiff?: (input: { base: string; head: string; cwd: string }) => Promise<ReadonlyArray<string>>;
};

const runFixtureCli = async ({ fixture, argv, gitDiff }: RunFixtureCliInput) => {
  const fs = await loadFixtureFileSystem(fixture);
  const output: string[] = [];

  const result = await runCli(
    argv,
    {
      stdout: (chunk) => {
        output.push(chunk);
      },
      stderr: (chunk) => {
        output.push(chunk);
      }
    },
    {
      fs,
      cwd: ".",
      gitDiff
    }
  );

  return {
    result,
    output: output.join("")
  };
};

describe("fixture-backed CLI coverage", () => {
  it("renders text output and warnings from the single-package fixture", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "single-package",
      argv: ["impact", "--changed", "src/shared.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Changed files:");
    expect(output).toContain("  src/shared.ts");
    expect(output).toContain("Affected modules:");
    expect(output).toContain("  src/feature.ts");
    expect(output).toContain("  src/page.ts");
    expect(output).toContain("Recommended E2E tests:");
    expect(output).toContain("  e2e/page.spec.ts");
    expect(output).toContain("    path: src/shared.ts -> src/feature.ts -> src/page.ts");
    expect(output).toContain("Warnings:");
    expect(output).toContain("dynamic import target is not statically resolvable");
  });

  it("renders JSON output from the single-package fixture in base/head mode", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "single-package",
      argv: ["impact", "--base", "origin/main", "--head", "HEAD", "--format", "json"],
      gitDiff: vi.fn(async () => ["src/shared.ts"])
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(output)).toEqual({
      changedFiles: ["src/shared.ts"],
      affectedModules: ["src/feature.ts", "src/page.ts", "src/shared.ts"],
      recommendedTests: [
        {
          test: "e2e/page.spec.ts",
          reasons: [
            {
              changedFile: "src/shared.ts",
              declaredTarget: "src/page.ts",
              dependencyPath: ["src/shared.ts", "src/feature.ts", "src/page.ts"]
            }
          ]
        }
      ],
      warnings: ["src/dynamic.ts:3 dynamic import target is not statically resolvable"]
    });
  });

  it("exits successfully when the single-package fixture has no mapped tests", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "single-package",
      argv: ["impact", "--changed", "src/unrelated.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Recommended E2E tests:");
    expect(output).toContain("  none");
  });

  it("selects tests through package.json workspace discovery", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "package-json-workspaces",
      argv: ["impact", "--changed", "packages/ui/src/button.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain("e2e/checkout.spec.ts");
    expect(output).toContain("packages/ui/src/button.ts -> apps/web/src/components/CheckoutForm.ts -> apps/web/src/screens/CheckoutScreen.ts");
  });

  it("selects tests through pnpm workspace discovery", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "pnpm-workspace",
      argv: ["impact", "--changed", "packages/shared/src/button.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain("e2e/mobile.spec.ts");
    expect(output).toContain("packages/shared/src/button.ts -> apps/mobile/src/components/CheckoutForm.ts -> apps/mobile/src/screens/CheckoutScreen.ts");
  });

  it("selects tests through tsconfig paths", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "tsconfig-paths",
      argv: ["impact", "--changed", "packages/shared/src/button.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain("e2e/routes.spec.ts");
    expect(output).toContain("packages/shared/src/button.ts -> apps/web/src/routes.ts");
  });

  it("selects tests through package exports", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "package-exports",
      argv: ["impact", "--changed", "packages/ui/src/features/card.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain("e2e/routes.spec.ts");
    expect(output).toContain("packages/ui/src/features/card.ts -> apps/web/src/routes.ts");
  });

  it("narrows barrel impacts to matching entity consumers", async () => {
    const { result, output } = await runFixtureCli({
      fixture: "barrel-entities",
      argv: ["impact", "--changed", "src/sourceB.ts", "--format", "json"]
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(output)).toEqual({
      changedFiles: ["src/sourceB.ts"],
      affectedModules: [
        "src/aliasB.ts",
        "src/b.ts",
        "src/barrel.ts",
        "src/dynamicConsumer.ts",
        "src/sourceB.ts"
      ],
      recommendedTests: [
        {
          test: "e2e/alias-b.spec.ts",
          reasons: [
            {
              changedFile: "src/sourceB.ts",
              declaredTarget: "src/aliasB.ts",
              dependencyPath: ["src/sourceB.ts", "src/barrel.ts", "src/aliasB.ts"]
            }
          ]
        },
        {
          test: "e2e/b.spec.ts",
          reasons: [
            {
              changedFile: "src/sourceB.ts",
              declaredTarget: "src/b.ts",
              dependencyPath: ["src/sourceB.ts", "src/barrel.ts", "src/b.ts"]
            }
          ]
        },
        {
          test: "e2e/dynamic.spec.ts",
          reasons: [
            {
              changedFile: "src/sourceB.ts",
              declaredTarget: "src/dynamicConsumer.ts",
              dependencyPath: ["src/sourceB.ts", "src/barrel.ts", "src/dynamicConsumer.ts"]
            }
          ]
        }
      ],
      warnings: []
    });
    expect(output).not.toContain("e2e/a.spec.ts");
  });
});

describe("workspace package import fixture", () => {
  it("resolves workspace package imports to package roots in the dependency graph", async () => {
    const fs = await loadFixtureFileSystem("workspace-package-import");
    const workspacePackages = await discoverWorkspaces(".", fs, [packageJsonWorkspacesStrategy]);
    const graph = await buildGraph(
      [
        {
          path: "apps/web/src/routes.ts",
          scan: scanFileText({
            filePath: "apps/web/src/routes.ts",
            text: await fs.readFile("apps/web/src/routes.ts")
          })
        }
      ],
      {
        resolveContext: {
          fs,
          workspacePackages
        }
      }
    );

    expect(workspacePackages).toEqual([
      {
        name: "@acme/web",
        root: "apps/web",
        packageJsonPath: "apps/web/package.json"
      },
      {
        name: "@acme/ui",
        root: "packages/ui",
        packageJsonPath: "packages/ui/package.json"
      }
    ]);

    expect(graph.edges).toEqual([
      {
        from: "apps/web/src/routes.ts",
        to: "packages/ui",
        resolver: "workspace-package",
        entities: { type: "all" },
        reExports: null
      }
    ]);
  });
});
