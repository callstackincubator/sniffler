import { describe, expect, it } from "vitest";
import { buildGraph } from "../src/graph/build-graph.js";
import { traverseImpact } from "../src/graph/traverse-impact.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { relativeResolver } from "../src/resolvers/relative-resolver.js";
import { scanFileText } from "../src/scanner/scan-file.js";

describe("relativeResolver", () => {
  it("resolves ./ and ../ specifiers relative to the importing file", async () => {
    const context = { fs: createMemoryFileSystem() };

    await expect(
      relativeResolver.resolve("./shared/helpers.ts", "src/components/Button.tsx", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "src/components/shared/helpers.ts",
      resolver: "relative"
    });

    await expect(
      relativeResolver.resolve("../shared/helpers.ts", "src/components/Button.tsx", context)
    ).resolves.toEqual({
      type: "resolved",
      path: "src/shared/helpers.ts",
      resolver: "relative"
    });
  });
});

describe("graph traversal", () => {
  it("builds reverse dependencies and keeps the shortest dependency path", async () => {
    const graph = await buildGraph([
      {
        path: "src/shared/helpers.ts",
        scan: scanFileText({
          filePath: "src/shared/helpers.ts",
          text: "export const helpers = true;"
        })
      },
      {
        path: "src/components/Button.tsx",
        scan: scanFileText({
          filePath: "src/components/Button.tsx",
          text: 'import "../shared/helpers.ts";'
        })
      },
      {
        path: "src/features/Analytics.tsx",
        scan: scanFileText({
          filePath: "src/features/Analytics.tsx",
          text: 'import "../shared/helpers.ts";'
        })
      },
      {
        path: "src/screens/CheckoutScreen.tsx",
        scan: scanFileText({
          filePath: "src/screens/CheckoutScreen.tsx",
          text: [
            'import "../components/Button.tsx";',
            'import "../features/Analytics.tsx";'
          ].join("\n")
        })
      },
      {
        path: "src/features/Dashboard.tsx",
        scan: scanFileText({
          filePath: "src/features/Dashboard.tsx",
          text: 'import "../features/Analytics.tsx";'
        })
      },
      {
        path: "src/features/Summary.tsx",
        scan: scanFileText({
          filePath: "src/features/Summary.tsx",
          text: 'import "../features/Dashboard.tsx";'
        })
      },
      {
        path: "src/screens/Top.tsx",
        scan: scanFileText({
          filePath: "src/screens/Top.tsx",
          text: [
            'import "./CheckoutScreen.tsx";',
            'import "../features/Summary.tsx";'
          ].join("\n")
        })
      }
    ]);

    expect(graph.edges).toEqual([
      {
        from: "src/components/Button.tsx",
        to: "src/shared/helpers.ts",
        resolver: "relative"
      },
      {
        from: "src/features/Analytics.tsx",
        to: "src/shared/helpers.ts",
        resolver: "relative"
      },
      {
        from: "src/features/Dashboard.tsx",
        to: "src/features/Analytics.tsx",
        resolver: "relative"
      },
      {
        from: "src/features/Summary.tsx",
        to: "src/features/Dashboard.tsx",
        resolver: "relative"
      },
      {
        from: "src/screens/CheckoutScreen.tsx",
        to: "src/components/Button.tsx",
        resolver: "relative"
      },
      {
        from: "src/screens/CheckoutScreen.tsx",
        to: "src/features/Analytics.tsx",
        resolver: "relative"
      },
      {
        from: "src/screens/Top.tsx",
        to: "src/features/Summary.tsx",
        resolver: "relative"
      },
      {
        from: "src/screens/Top.tsx",
        to: "src/screens/CheckoutScreen.tsx",
        resolver: "relative"
      }
    ]);

    const impact = await traverseImpact(graph, ["src/shared/helpers.ts"]);

    expect(impact.affectedModules).toEqual([
      "src/shared/helpers.ts",
      "src/components/Button.tsx",
      "src/features/Analytics.tsx",
      "src/screens/CheckoutScreen.tsx",
      "src/features/Dashboard.tsx",
      "src/screens/Top.tsx",
      "src/features/Summary.tsx"
    ]);

    expect(impact.paths).toEqual([
      {
        module: "src/shared/helpers.ts",
        path: ["src/shared/helpers.ts"]
      },
      {
        module: "src/components/Button.tsx",
        path: ["src/shared/helpers.ts", "src/components/Button.tsx"]
      },
      {
        module: "src/features/Analytics.tsx",
        path: ["src/shared/helpers.ts", "src/features/Analytics.tsx"]
      },
      {
        module: "src/screens/CheckoutScreen.tsx",
        path: [
          "src/shared/helpers.ts",
          "src/components/Button.tsx",
          "src/screens/CheckoutScreen.tsx"
        ]
      },
      {
        module: "src/features/Dashboard.tsx",
        path: [
          "src/shared/helpers.ts",
          "src/features/Analytics.tsx",
          "src/features/Dashboard.tsx"
        ]
      },
      {
        module: "src/screens/Top.tsx",
        path: [
          "src/shared/helpers.ts",
          "src/components/Button.tsx",
          "src/screens/CheckoutScreen.tsx",
          "src/screens/Top.tsx"
        ]
      },
      {
        module: "src/features/Summary.tsx",
        path: [
          "src/shared/helpers.ts",
          "src/features/Analytics.tsx",
          "src/features/Dashboard.tsx",
          "src/features/Summary.tsx"
        ]
      }
    ]);
  });
});
