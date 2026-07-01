import { describe, expect, it, vi } from "vitest";
import type { Diagnostics } from "../src/diagnostics/diagnostics.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";

vi.mock("../src/graph/build-graph.js", async () => {
  const actual = await vi.importActual<typeof import("../src/graph/build-graph.js")>(
    "../src/graph/build-graph.js"
  );

  return {
    ...actual,
    buildGraph: vi.fn(async () => ({
      nodes: [],
      edges: [],
      warnings: [
        {
          source: "resolver" as const,
          kind: "import" as const,
          resolver: "relative",
          file: "src/app.ts",
          specifier: "./missing",
          importKind: "import" as const,
          message: "No source file matched ./missing"
        }
      ]
    }))
  };
});

import { prepareImpactGraph } from "../src/impact/graph-workflow.js";
import { buildGraph } from "../src/graph/build-graph.js";

const createDiagnostics = (): Diagnostics & { warnings: Array<unknown> } => {
  const warnings: Array<unknown> = [];

  return {
    warnings,
    time: async <T>(_name: string, action: () => Promise<T>): Promise<T> => {
      return await action();
    },
    record: () => {},
    increment: () => {},
    warning: (value) => {
      warnings.push(value);
    },
    flush: async () => {}
  };
};

describe("impact graph workflow", () => {
  it("forwards graph warnings to diagnostics", async () => {
    const fs = createMemoryFileSystem({
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
          manifest: ".sniffler/test-map.json"
        }
      }),
      ".sniffler/test-map.json": JSON.stringify({ tests: [] }),
      "src/app.ts": 'import "./missing";\nexport const app = 1;'
    });
    const diagnostics = createDiagnostics();

    const result = await prepareImpactGraph({
      fs,
      cwd: ".",
      config: {
        source: {
          roots: ["src"],
          extensions: [".ts"],
          ignore: []
        },
        workspaces: {
          strategies: []
        },
        tests: {
          manifest: ".sniffler/test-map.json"
        }
      },
      diagnostics,
      staleChecker: {
        isStale: async () => false
      }
    });

    expect(vi.mocked(buildGraph)).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual(["No source file matched ./missing"]);
    expect(diagnostics.warnings).toHaveLength(1);
    expect(diagnostics.warnings[0]).toMatchObject({
      source: "resolver",
      kind: "import",
      resolver: "relative",
      file: "src/app.ts",
      specifier: "./missing",
      message: "No source file matched ./missing"
    });
  });
});
