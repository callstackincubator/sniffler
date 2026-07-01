import { describe, expect, it } from "vitest";
import type { ImpactResult } from "../src/graph/traverse-impact.js";
import type { TestMap } from "../src/test-map/load-test-map.js";
import { recommendTests } from "../src/test-map/recommend-tests.js";

const impact: ImpactResult = {
  affectedModules: [
    "packages/core/src/index.ts",
    "apps/web/src/components/Button.tsx",
    "apps/web/src/screens/Checkout.tsx",
    "apps/web/src/screens/Order.tsx"
  ],
  paths: [
    {
      module: "packages/core/src/index.ts",
      path: ["packages/core/src/index.ts"]
    },
    {
      module: "apps/web/src/components/Button.tsx",
      path: ["packages/core/src/index.ts", "apps/web/src/components/Button.tsx"]
    },
    {
      module: "apps/web/src/screens/Checkout.tsx",
      path: [
        "packages/core/src/index.ts",
        "apps/web/src/components/Button.tsx",
        "apps/web/src/screens/Checkout.tsx"
      ]
    },
    {
      module: "apps/web/src/screens/Order.tsx",
      path: [
        "packages/core/src/index.ts",
        "apps/web/src/components/Button.tsx",
        "apps/web/src/screens/Checkout.tsx",
        "apps/web/src/screens/Order.tsx"
      ]
    }
  ]
};

const testMap: TestMap = [
  {
    test: "zeta.spec.ts",
    dependsOn: ["apps/web/src/screens/Checkout.tsx", "apps/web/src/screens/**"]
  },
  {
    test: "alpha.spec.ts",
    dependsOn: ["packages/core/src/index.ts"]
  }
];

const containmentImpact: any = {
  affectedModules: ["src/shared.ts", "src/feature.ts", "src/App.tsx", "src/screens/Checkout.tsx"],
  paths: [
    {
      module: "src/feature.ts",
      invalidatedRoot: "src/App.tsx",
      path: ["src/App.tsx", "src/feature.ts"]
    },
    {
      module: "src/screens/Checkout.tsx",
      invalidatedRoot: "src/App.tsx",
      path: ["src/App.tsx", "src/screens/Checkout.tsx"]
    }
  ]
};

const containmentTestMap: TestMap = [
  {
    test: "alpha.spec.ts",
    dependsOn: ["src/feature.ts"]
  },
  {
    test: "zeta.spec.ts",
    dependsOn: ["src/screens/Checkout.tsx"]
  }
];

describe("recommendTests", () => {
  it("matches exact and glob targets with shortest dependency paths", () => {
    expect(recommendTests({ testMap, impact })).toEqual([
      {
        test: "alpha.spec.ts",
        reasons: [
          {
            changedFile: "packages/core/src/index.ts",
            declaredTarget: "packages/core/src/index.ts",
            dependencyPath: ["packages/core/src/index.ts"]
          }
        ]
      },
      {
        test: "zeta.spec.ts",
        reasons: [
          {
            changedFile: "packages/core/src/index.ts",
            declaredTarget: "apps/web/src/screens/Checkout.tsx",
            dependencyPath: [
              "packages/core/src/index.ts",
              "apps/web/src/components/Button.tsx",
              "apps/web/src/screens/Checkout.tsx"
            ]
          },
          {
            changedFile: "packages/core/src/index.ts",
            declaredTarget: "apps/web/src/screens/**",
            dependencyPath: [
              "packages/core/src/index.ts",
              "apps/web/src/components/Button.tsx",
              "apps/web/src/screens/Checkout.tsx"
            ]
          },
          {
            changedFile: "packages/core/src/index.ts",
            declaredTarget: "apps/web/src/screens/**",
            dependencyPath: [
              "packages/core/src/index.ts",
              "apps/web/src/components/Button.tsx",
              "apps/web/src/screens/Checkout.tsx",
              "apps/web/src/screens/Order.tsx"
            ]
          }
        ]
      }
    ]);
  });

  it("adds containment reasons when a touched root invalidates a subtree", () => {
    const containmentInput = {
      testMap: containmentTestMap,
      impact: {
        affectedModules: ["src/shared.ts", "src/feature.ts", "src/App.tsx"],
        paths: [
          {
            module: "src/feature.ts",
            path: ["src/shared.ts", "src/feature.ts"]
          },
          {
            module: "src/App.tsx",
            path: ["src/shared.ts", "src/feature.ts", "src/App.tsx"]
          }
        ]
      },
      containment: containmentImpact
    } as any;

    expect(recommendTests(containmentInput)).toEqual([
      {
        test: "alpha.spec.ts",
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
      },
      {
        test: "zeta.spec.ts",
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
      }
    ]);
  });

  it("returns stable results even when the manifest order changes", () => {
    const shuffled: TestMap = [...testMap].reverse();

    expect(recommendTests({ testMap: shuffled, impact })).toEqual(recommendTests({ testMap, impact }));
  });
});
