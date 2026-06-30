import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { selectImpact } from "../src/impact/impact-command.js";

const createContainmentFixtureFileSystem = () => {
  return createMemoryFileSystem({
    ".sniffler/config.json": JSON.stringify({
      source: {
        roots: ["src"],
        extensions: [".ts", ".tsx"],
        ignore: []
      },
      workspaces: {
        strategies: []
      },
      tests: {
        manifest: ".sniffler/test-map.json",
        invalidateSubtreeWhenTouched: ["src/App.tsx"]
      }
    }),
    ".sniffler/test-map.json": JSON.stringify({
      tests: [
        {
          test: "e2e/checkout.spec.ts",
          targets: ["src/screens/Checkout.tsx"]
        },
        {
          test: "e2e/details.spec.ts",
          targets: ["src/screens/CheckoutDetails.tsx"]
        },
        {
          test: "e2e/feature.spec.ts",
          targets: ["src/feature.ts"]
        },
        {
          test: "e2e/other.spec.ts",
          targets: ["src/other.ts"]
        }
      ]
    }),
    "src/App.tsx": [
      'import "./feature.ts";',
      'import "./screens/Checkout.tsx";',
      "export const App = true;"
    ].join("\n"),
    "src/feature.ts": ['import "./shared.ts";', "export const feature = true;"].join("\n"),
    "src/shared.ts": "export const shared = true;",
    "src/screens/Checkout.tsx": ['import "./CheckoutDetails.tsx";', "export const checkout = true;"].join("\n"),
    "src/screens/CheckoutDetails.tsx": "export const details = true;",
    "src/other.ts": "export const other = true;"
  });
};

describe("containment impact", () => {
  it("selects forward descendants when invalidated root changes directly", async () => {
    const fs = createContainmentFixtureFileSystem();

    const result = await selectImpact({ changedFiles: ["src/App.tsx"] }, { fs, cwd: "." });

    expect(result.changedFiles).toEqual(["src/App.tsx"]);
    expect(result.affectedModules).toEqual([
      "src/App.tsx",
      "src/feature.ts",
      "src/screens/Checkout.tsx",
      "src/screens/CheckoutDetails.tsx",
      "src/shared.ts"
    ]);
    expect(result.recommendedTests).toEqual([
      {
        test: "e2e/checkout.spec.ts",
        reasons: [
          {
            kind: "containment",
            changedFile: "src/App.tsx",
            declaredTarget: "src/screens/Checkout.tsx",
            invalidatedRoot: "src/App.tsx",
            dependencyPath: ["src/App.tsx"],
            containmentPath: ["src/App.tsx", "src/screens/Checkout.tsx"]
          }
        ]
      },
      {
        test: "e2e/details.spec.ts",
        reasons: [
          {
            kind: "containment",
            changedFile: "src/App.tsx",
            declaredTarget: "src/screens/CheckoutDetails.tsx",
            invalidatedRoot: "src/App.tsx",
            dependencyPath: ["src/App.tsx"],
            containmentPath: ["src/App.tsx", "src/screens/Checkout.tsx", "src/screens/CheckoutDetails.tsx"]
          }
        ]
      },
      {
        test: "e2e/feature.spec.ts",
        reasons: [
          {
            kind: "containment",
            changedFile: "src/App.tsx",
            declaredTarget: "src/feature.ts",
            invalidatedRoot: "src/App.tsx",
            dependencyPath: ["src/App.tsx"],
            containmentPath: ["src/App.tsx", "src/feature.ts"]
          }
        ]
      }
    ]);
    expect(result.recommendedTests).not.toEqual(
      expect.arrayContaining([
        {
          test: "e2e/other.spec.ts",
          reasons: expect.anything()
        }
      ])
    );
  });

  it("keeps reverse paths and adds containment reasons when root is touched through dependency changes", async () => {
    const fs = createContainmentFixtureFileSystem();

    const result = await selectImpact({ changedFiles: ["src/shared.ts"] }, { fs, cwd: "." });

    expect(result.changedFiles).toEqual(["src/shared.ts"]);
    expect(result.affectedModules).toEqual([
      "src/App.tsx",
      "src/feature.ts",
      "src/screens/Checkout.tsx",
      "src/screens/CheckoutDetails.tsx",
      "src/shared.ts"
    ]);
    expect(result.recommendedTests).toEqual([
      {
        test: "e2e/checkout.spec.ts",
        reasons: [
          {
            kind: "containment",
            changedFile: "src/shared.ts",
            declaredTarget: "src/screens/Checkout.tsx",
            invalidatedRoot: "src/App.tsx",
            dependencyPath: ["src/shared.ts", "src/feature.ts", "src/App.tsx"],
            containmentPath: ["src/App.tsx", "src/screens/Checkout.tsx"]
          }
        ]
      },
      {
        test: "e2e/details.spec.ts",
        reasons: [
          {
            kind: "containment",
            changedFile: "src/shared.ts",
            declaredTarget: "src/screens/CheckoutDetails.tsx",
            invalidatedRoot: "src/App.tsx",
            dependencyPath: ["src/shared.ts", "src/feature.ts", "src/App.tsx"],
            containmentPath: ["src/App.tsx", "src/screens/Checkout.tsx", "src/screens/CheckoutDetails.tsx"]
          }
        ]
      },
      {
        test: "e2e/feature.spec.ts",
        reasons: [
          {
            changedFile: "src/shared.ts",
            declaredTarget: "src/feature.ts",
            dependencyPath: ["src/shared.ts", "src/feature.ts"]
          },
          {
            kind: "containment",
            changedFile: "src/shared.ts",
            declaredTarget: "src/feature.ts",
            invalidatedRoot: "src/App.tsx",
            dependencyPath: ["src/shared.ts", "src/feature.ts", "src/App.tsx"],
            containmentPath: ["src/App.tsx", "src/feature.ts"]
          }
        ]
      }
    ]);
    expect(result.recommendedTests).not.toEqual(
      expect.arrayContaining([
        {
          test: "e2e/other.spec.ts",
          reasons: expect.anything()
        }
      ])
    );
  });

  it("uses source roots and synthetic containment edges for Expo Router app layouts", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/config.json": JSON.stringify({
        source: {
          roots: ["src", "app"],
          extensions: [".ts", ".tsx"],
          ignore: []
        },
        graph: {
          contains: [
            {
              from: "app/_layout.tsx",
              to: "app/**/*.tsx"
            }
          ]
        },
        workspaces: {
          strategies: []
        },
        tests: {
          manifest: ".sniffler/test-map.json",
          invalidateSubtreeWhenTouched: ["app/_layout.tsx"]
        }
      }),
      ".sniffler/test-map.json": JSON.stringify({
        tests: [
          {
            test: "e2e/home.spec.ts",
            targets: ["app/home.tsx"]
          }
        ]
      }),
      "app/_layout.tsx": "export const layout = true;",
      "app/home.tsx": "export const home = true;",
      "src/unused.ts": "export const unused = true;"
    });

    const result = await selectImpact({ changedFiles: ["app/_layout.tsx"] }, { fs, cwd: "." });

    expect(result.changedFiles).toEqual(["app/_layout.tsx"]);
    expect(result.affectedModules).toEqual(["app/_layout.tsx", "app/home.tsx"]);
    expect(result.recommendedTests).toEqual([
      {
        test: "e2e/home.spec.ts",
        reasons: [
          {
            kind: "containment",
            changedFile: "app/_layout.tsx",
            declaredTarget: "app/home.tsx",
            invalidatedRoot: "app/_layout.tsx",
            dependencyPath: ["app/_layout.tsx"],
            containmentPath: ["app/_layout.tsx", "app/home.tsx"],
            containmentPathEdges: [
              {
                from: "app/_layout.tsx",
                to: "app/home.tsx",
                synthetic: {
                  kind: "containment",
                  from: "app/_layout.tsx",
                  to: "app/home.tsx"
                }
              }
            ]
          }
        ]
      }
    ]);
  });
});
