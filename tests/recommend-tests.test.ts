import { describe, expect, it } from "vitest";
import type { ContainmentResult } from "../src/graph/traverse-containment.js";
import type { ImpactResult } from "../src/graph/traverse-impact.js";
import {
  recommendTests,
  resolveRunAllReasons,
  selectInvalidatedRoots,
  selectRunAllRecommendation,
  selectRunAllTests
} from "../src/test-map/recommend-tests.js";
import type { TestMap } from "../src/test-map/load-test-map.js";

const impact: ImpactResult = {
  affectedModules: ["src/app.ts", "src/shared.ts", "src/feature.ts"],
  paths: [
    {
      module: "src/app.ts",
      path: ["src/app.ts"]
    },
    {
      module: "src/shared.ts",
      path: ["src/app.ts", "src/shared.ts"]
    },
    {
      module: "src/feature.ts",
      path: ["src/app.ts", "src/shared.ts", "src/feature.ts"]
    }
  ]
};

const containment: ContainmentResult = {
  affectedModules: ["src/app.ts", "src/shared.ts", "src/feature.ts"],
  paths: [
    {
      module: "src/feature.ts",
      invalidatedRoot: "src/app.ts",
      path: ["src/app.ts", "src/feature.ts"]
    }
  ]
};

const testMap: TestMap = [
  {
    test: "b.spec.ts",
    dependsOn: ["src/feature.ts"]
  },
  {
    test: "a.spec.ts",
    dependsOn: ["src/app.ts", "src/shared.ts"]
  }
];

describe("recommend-tests", () => {
  it("selects every mapped test for run-all reasons", () => {
    const reasons = resolveRunAllReasons(["pnpm-lock.yaml"], ["pnpm-lock.yaml"]);

    expect(selectRunAllRecommendation(testMap, reasons)).toEqual({
      reasons,
      recommendedTests: [
        {
          test: "a.spec.ts",
          reasons
        },
        {
          test: "b.spec.ts",
          reasons
        }
      ]
    });
  });

  it("selects invalidated roots through the recommendation policy seam", () => {
    expect(
      selectInvalidatedRoots(["src/App.tsx", "src/screens/**"], [
        "src/App.tsx",
        "src/feature.ts",
        "src/screens/Checkout.tsx",
        "src/other.ts"
      ])
    ).toEqual(["src/App.tsx", "src/screens/Checkout.tsx"]);
  });

  it("selects every mapped test through the legacy helper", () => {
    const reasons = resolveRunAllReasons(["pnpm-lock.yaml"], ["pnpm-lock.yaml"]);

    expect(selectRunAllTests(testMap, reasons)).toEqual([
      {
        test: "a.spec.ts",
        reasons
      },
      {
        test: "b.spec.ts",
        reasons
      }
    ]);
  });

  it("keeps shared targets and containment reasoning together", () => {
    expect(
      recommendTests({
        testMap,
        impact,
        containment,
        sharedTargets: ["src/shared.ts"]
      })
    ).toEqual([
      {
        test: "a.spec.ts",
        reasons: [
          {
            changedFile: "src/app.ts",
            declaredTarget: "src/app.ts",
            dependencyPath: ["src/app.ts"]
          },
          {
            changedFile: "src/app.ts",
            declaredTarget: "src/shared.ts",
            dependencyPath: ["src/app.ts", "src/shared.ts"]
          }
        ]
      },
      {
        test: "b.spec.ts",
        reasons: [
          {
            changedFile: "src/app.ts",
            declaredTarget: "src/shared.ts",
            dependencyPath: ["src/app.ts", "src/shared.ts"]
          },
          {
            changedFile: "src/app.ts",
            declaredTarget: "src/feature.ts",
            dependencyPath: ["src/app.ts", "src/shared.ts", "src/feature.ts"]
          },
          {
            kind: "containment",
            changedFile: "src/app.ts",
            declaredTarget: "src/feature.ts",
            invalidatedRoot: "src/app.ts",
            dependencyPath: ["src/app.ts"],
            containmentPath: ["src/app.ts", "src/feature.ts"]
          }
        ]
      }
    ]);
  });
});
