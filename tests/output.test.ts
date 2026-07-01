import { describe, expect, it } from "vitest";
import { renderJsonOutput } from "../src/output/json-output.js";
import { renderTextOutput } from "../src/output/text-output.js";
import type { ImpactOutput } from "../src/output/output-types.js";

const output = {
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
          kind: "containment",
          changedFile: "packages/core/src/index.ts",
          declaredTarget: "apps/web/src/screens/Checkout.tsx",
          invalidatedRoot: "apps/web/src/screens/Checkout.tsx",
          dependencyPath: [
            "packages/core/src/index.ts",
            "apps/web/src/components/Button.tsx",
            "apps/web/src/screens/Checkout.tsx"
          ],
          containmentPath: ["apps/web/src/screens/Checkout.tsx"],
          containmentPathEdges: [
            {
              from: "apps/web/src/components/Button.tsx",
              to: "apps/web/src/screens/Checkout.tsx",
              synthetic: {
                kind: "containment",
                from: "apps/web/src/components/Button.tsx",
                to: "apps/web/src/screens/Checkout.tsx"
              }
            }
          ]
        }
      ]
    }
  ],
  warnings: ["apps/web/src/routes.ts:12 dynamic import target is not statically resolvable"]
} as unknown as ImpactOutput;

describe("output rendering", () => {
  it("renders stable human-readable text output", () => {
    expect(renderTextOutput(output)).toContain("Impact");
    expect(renderTextOutput(output)).toContain("1 test selected");
    expect(renderTextOutput(output)).toContain("e2e/checkout.spec.ts");
    expect(renderTextOutput(output)).toContain("depends on affected");
    expect(renderTextOutput(output)).toContain("apps/web/src/screens/Checkout.tsx");
    expect(renderTextOutput(output)).toContain("1 warning");
    expect(renderTextOutput(output)).toContain("Run with --diagnostics");
    expect(renderTextOutput(output)).not.toContain("dynamic import target is not statically resolvable");
  });

  it("renders diagnostics path when provided", () => {
    expect(renderTextOutput(output, { diagnosticsPath: ".sniffler/diagnostics.json" })).toContain(
      "Diagnostics"
    );
    expect(renderTextOutput(output, { diagnosticsPath: ".sniffler/diagnostics.json" })).toContain(
      ".sniffler/diagnostics.json"
    );
    expect(renderTextOutput(output, { diagnosticsPath: ".sniffler/diagnostics.json" })).not.toContain(
      "Run with --diagnostics"
    );
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
            kind: "containment",
            changedFile: "packages/core/src/index.ts",
            declaredTarget: "apps/web/src/screens/Checkout.tsx",
            invalidatedRoot: "apps/web/src/screens/Checkout.tsx",
            dependencyPath: [
              "packages/core/src/index.ts",
              "apps/web/src/components/Button.tsx",
              "apps/web/src/screens/Checkout.tsx"
            ],
            containmentPath: ["apps/web/src/screens/Checkout.tsx"],
            containmentPathEdges: [
              {
                from: "apps/web/src/components/Button.tsx",
                to: "apps/web/src/screens/Checkout.tsx",
                synthetic: {
                  kind: "containment",
                  from: "apps/web/src/components/Button.tsx",
                  to: "apps/web/src/screens/Checkout.tsx"
                }
              }
            ]
          }
        ]
      }
      ],
      warnings: ["apps/web/src/routes.ts:12 dynamic import target is not statically resolvable"]
    });
  });
});
