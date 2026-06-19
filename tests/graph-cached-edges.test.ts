import { describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { scanFileText } from "../src/scanner/scan-file.js";

vi.mock("../src/resolvers/resolve-import.js", async () => {
  const actual = await vi.importActual<typeof import("../src/resolvers/resolve-import.js")>(
    "../src/resolvers/resolve-import.js"
  );

  return {
    ...actual,
    resolveImport: vi.fn(actual.resolveImport)
  };
});

import { buildGraph } from "../src/graph/build-graph.js";
import { resolveImport } from "../src/resolvers/resolve-import.js";

describe("buildGraph cached resolved edges", () => {
  it("skips resolver work for nodes with cached resolved edges", async () => {
    const fs = createMemoryFileSystem({
      "src/cached.ts": 'import "./dep.ts";',
      "src/uncached.ts": 'import "./dep.ts";',
      "src/dep.ts": "export const dep = true;"
    });

    const graph = await buildGraph(
      [
        {
          path: "src/cached.ts",
          scan: scanFileText({
            filePath: "src/cached.ts",
            text: 'import "./dep.ts";'
          }),
          resolvedEdges: [
            {
              from: "src/cached.ts",
              to: "src/dep.ts",
              resolver: "relative",
              entities: { type: "all" },
              reExports: null
            }
          ]
        },
        {
          path: "src/uncached.ts",
          scan: scanFileText({
            filePath: "src/uncached.ts",
            text: 'import "./dep.ts";'
          })
        }
      ],
      {
        resolveContext: {
          fs
        }
      }
    );

    expect(graph.edges).toEqual([
      {
        from: "src/cached.ts",
        to: "src/dep.ts",
        resolver: "relative",
        entities: { type: "all" },
        reExports: null
      },
      {
        from: "src/uncached.ts",
        to: "src/dep.ts",
        resolver: "relative",
        entities: { type: "all" },
        reExports: null
      }
    ]);
    expect(vi.mocked(resolveImport)).toHaveBeenCalledTimes(1);
  });
});
