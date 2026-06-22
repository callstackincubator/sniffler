import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { Diagnostics } from "../src/diagnostics/diagnostics.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFileText } from "../src/scanner/scan-file.js";

const createDiagnostics = (): Diagnostics & {
  metrics: Map<string, number | string | boolean>;
  stages: Array<{ name: string; durationMs: number }>;
} => {
  const metrics = new Map<string, number | string | boolean>();
  const stages: Array<{ name: string; durationMs: number }> = [];

  return {
    metrics,
    stages,
    time: async <T>(name: string, action: () => Promise<T>): Promise<T> => {
      const startedAt = performance.now();
      try {
        return await action();
      } finally {
        stages.push({
          name,
          durationMs: performance.now() - startedAt
        });
      }
    },
    record: (name: string, value: number | string | boolean) => {
      metrics.set(name, value);
    },
    increment: (name: string, amount = 1) => {
      const current = metrics.get(name);
      metrics.set(name, typeof current === "number" ? current + amount : amount);
    },
    warning: () => {},
    flush: async () => {}
  };
};

describe("buildGraph diagnostics", () => {
  it("records aggregate graph stages and metrics", async () => {
    const diagnostics = createDiagnostics();
    const fs = createMemoryFileSystem({
      "src/app.ts": [
        'import "./dep.ts";',
        'import "fs";',
        'export * from "./dep.ts";'
      ].join("\n"),
      "src/cached.ts": 'import "./dep.ts";',
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
          path: "src/app.ts",
          scan: scanFileText({
            filePath: "src/app.ts",
            text: [
              'import "./dep.ts";',
              'import "fs";',
              'export * from "./dep.ts";'
            ].join("\n")
          })
        },
        {
          path: "src/dep.ts",
          scan: scanFileText({
            filePath: "src/dep.ts",
            text: "export const dep = true;"
          })
        }
      ],
      {
        diagnostics,
        resolveContext: {
          fs
        }
      }
    );

    expect(graph.edges).toEqual([
      {
        from: "src/app.ts",
        to: "src/dep.ts",
        resolver: "relative",
        entities: { type: "all" },
        reExports: { type: "all" }
      },
      {
        from: "src/app.ts",
        to: "src/dep.ts",
        resolver: "relative",
        entities: { type: "all" },
        reExports: null
      },
      {
        from: "src/cached.ts",
        to: "src/dep.ts",
        resolver: "relative",
        entities: { type: "all" },
        reExports: null
      }
    ]);

    expect(graph.warnings).toEqual([]);
    expect(diagnostics.stages.map((stage) => stage.name)).toEqual([
      "impact.graph.nodes.normalize",
      "impact.graph.resolve.imports",
      "impact.graph.resolve.exports",
      "impact.graph.edges.sort"
    ]);
    expect(diagnostics.metrics.get("graphResolvedEdgesFromCache")).toBe(1);
    expect(diagnostics.metrics.get("graphImportSpecifiers")).toBe(2);
    expect(diagnostics.metrics.get("graphImportResolved")).toBe(1);
    expect(diagnostics.metrics.get("graphImportExternal")).toBe(1);
    expect(diagnostics.metrics.get("graphImportUnresolved")).toBe(0);
    expect(diagnostics.metrics.get("graphExportSpecifiers")).toBe(1);
    expect(diagnostics.metrics.get("graphExportResolved")).toBe(1);
    expect(diagnostics.metrics.get("graphExportExternal")).toBe(0);
    expect(diagnostics.metrics.get("graphExportUnresolved")).toBe(0);
    expect(diagnostics.metrics.get("graphResolvedEdgesCreated")).toBe(2);
    expect(diagnostics.metrics.get("graphEdgesSorted")).toBe(3);
    expect(diagnostics.metrics.get("graphResolutionCacheMisses")).toBe(2);
    expect(diagnostics.metrics.get("graphResolutionCacheHits")).toBe(1);
    expect(diagnostics.metrics.get("graphResolverBuiltinExternal")).toBe(1);
    expect(diagnostics.metrics.get("graphResolver.relative.attempts")).toBe(1);
    expect(diagnostics.metrics.get("graphResolver.relative.resolved")).toBe(1);
    expect(typeof diagnostics.metrics.get("graphResolver.relative.durationMs")).toBe("number");
  });
});
