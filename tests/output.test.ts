import { describe, expect, it } from "vitest";
import { renderJsonOutput } from "../src/output/json-output.js";
import { renderTextOutput } from "../src/output/text-output.js";
import type { ImpactOutput } from "../src/output/output-types.js";

const output: ImpactOutput = {
  changedFiles: ["packages/core/src/index.ts"],
  affectedModules: [
    "apps/web/src/components/Button.tsx",
    "apps/web/src/screens/Checkout.tsx",
    "packages/core/src/index.ts"
  ],
  recommendedTests: [
    {
      test: "e2e/checkout.spec.ts",
      reasons: [
        {
          changedFile: "packages/core/src/index.ts",
          declaredTarget: "apps/web/src/screens/Checkout.tsx",
          dependencyPath: [
            "packages/core/src/index.ts",
            "apps/web/src/components/Button.tsx",
            "apps/web/src/screens/Checkout.tsx"
          ]
        }
      ]
    }
  ],
  warnings: ["apps/web/src/routes.ts:12 dynamic import target is not statically resolvable"]
};

describe("output rendering", () => {
  it("renders stable human-readable text output", () => {
    expect(renderTextOutput(output)).toContain("Changed files:");
    expect(renderTextOutput(output)).toContain("Recommended E2E tests:");
    expect(renderTextOutput(output)).toContain("e2e/checkout.spec.ts");
    expect(renderTextOutput(output)).toContain("dynamic import target is not statically resolvable");
  });

  it("renders stable JSON output", () => {
    expect(JSON.parse(renderJsonOutput(output))).toEqual({
      changedFiles: ["packages/core/src/index.ts"],
      affectedModules: [
        "apps/web/src/components/Button.tsx",
        "apps/web/src/screens/Checkout.tsx",
        "packages/core/src/index.ts"
      ],
      recommendedTests: [
        {
          test: "e2e/checkout.spec.ts",
          reasons: [
            {
              changedFile: "packages/core/src/index.ts",
              declaredTarget: "apps/web/src/screens/Checkout.tsx",
              dependencyPath: [
                "packages/core/src/index.ts",
                "apps/web/src/components/Button.tsx",
                "apps/web/src/screens/Checkout.tsx"
              ]
            }
          ]
        }
      ],
      warnings: ["apps/web/src/routes.ts:12 dynamic import target is not statically resolvable"]
    });
  });
});
