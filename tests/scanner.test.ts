import { describe, expect, it } from "vitest";
import { scanFileText } from "../src/scanner/scan-file.js";

describe("scanFileText", () => {
  it("collects entity-aware imports, requires, and literal dynamic imports", () => {
    const result = scanFileText({
      filePath: "src/example.ts",
      text: [
        'import value, { helper } from "./module-a";',
        'import type { Value } from "./module-b";',
        'export { exported } from "./module-c";',
        'export * from "./module-d";',
        'const required = require("./module-e");',
        'await import("./module-f");',
        'const templated = import(`./module-g`);'
      ].join("\n")
    });

    expect(result.imports).toEqual([
      {
        specifier: "./module-a",
        kind: "import",
        loc: { line: 1, column: 31 },
        entities: {
          type: "named",
          entities: [
            {
              imported: "default",
              local: "value"
            },
            {
              imported: "helper"
            }
          ]
        }
      },
      {
        specifier: "./module-b",
        kind: "import",
        loc: { line: 2, column: 28 },
        entities: {
          type: "named",
          entities: [
            {
              imported: "Value"
            }
          ]
        }
      },
      {
        specifier: "./module-e",
        kind: "require",
        loc: { line: 5, column: 26 },
        entities: {
          type: "all"
        }
      },
      {
        specifier: "./module-f",
        kind: "dynamic-import",
        loc: { line: 6, column: 14 },
        entities: {
          type: "all"
        }
      },
      {
        specifier: "./module-g",
        kind: "dynamic-import",
        loc: { line: 7, column: 26 },
        entities: {
          type: "all"
        }
      }
    ]);

    expect(result.exports).toEqual([
      {
        kind: "re-export",
        specifier: "./module-c",
        imported: "exported",
        exported: "exported",
        loc: { line: 3, column: 26 }
      },
      {
        kind: "re-export-all",
        specifier: "./module-d",
        loc: { line: 4, column: 15 }
      }
    ]);

    expect(result.warnings).toEqual([]);
  });

  it("captures local exports, aliases, defaults, and namespace re-exports", () => {
    const result = scanFileText({
      filePath: "src/exports.ts",
      text: [
        "export const A = 1, B = 2;",
        "export function C() {}",
        "export class D {}",
        "export enum E {}",
        "export type F = string;",
        "export interface G {}",
        "export default function H() {}",
        'export { A, B as RenamedB }',
        'export { default as PublicDefault } from "./module-a";',
        'export * as Namespace from "./module-b";'
      ].join("\n")
    });

    expect(result.exports).toEqual([
      {
        kind: "local",
        exported: "A",
        local: undefined,
        loc: { line: 1, column: 1 }
      },
      {
        kind: "local",
        exported: "B",
        local: undefined,
        loc: { line: 1, column: 1 }
      },
      {
        kind: "local",
        exported: "C",
        local: undefined,
        loc: { line: 2, column: 1 }
      },
      {
        kind: "local",
        exported: "D",
        local: undefined,
        loc: { line: 3, column: 1 }
      },
      {
        kind: "local",
        exported: "E",
        local: undefined,
        loc: { line: 4, column: 1 }
      },
      {
        kind: "local",
        exported: "F",
        local: undefined,
        loc: { line: 5, column: 1 }
      },
      {
        kind: "local",
        exported: "G",
        local: undefined,
        loc: { line: 6, column: 1 }
      },
      {
        kind: "local",
        exported: "default",
        local: undefined,
        loc: { line: 7, column: 1 }
      },
      {
        kind: "local",
        exported: "A",
        local: undefined,
        loc: { line: 8, column: 1 }
      },
      {
        kind: "local",
        exported: "RenamedB",
        local: "B",
        loc: { line: 8, column: 1 }
      },
      {
        kind: "re-export",
        specifier: "./module-a",
        imported: "default",
        exported: "PublicDefault",
        loc: { line: 9, column: 42 }
      },
      {
        kind: "re-export-all",
        specifier: "./module-b",
        exportedNamespace: "Namespace",
        loc: { line: 10, column: 28 }
      }
    ]);
  });

  it("emits warnings for non-literal dynamic imports and requires", () => {
    const result = scanFileText({
      filePath: "src/routes.ts",
      text: [
        "const path = getPath();",
        "await import(path);",
        "await import(`./${name}`);",
        "const required = require(path);"
      ].join("\n")
    });

    expect(result.imports).toEqual([]);
    expect(result.exports).toEqual([]);
    expect(result.warnings).toEqual([
      {
        type: "unresolved-dynamic-import",
        message: "src/routes.ts:2 dynamic import target is not statically resolvable",
        loc: { line: 2, column: 14 }
      },
      {
        type: "unresolved-dynamic-import",
        message: "src/routes.ts:3 dynamic import target is not statically resolvable",
        loc: { line: 3, column: 14 }
      },
      {
        type: "unresolved-dynamic-require",
        message: "src/routes.ts:4 dynamic require target is not statically resolvable",
        loc: { line: 4, column: 26 }
      }
    ]);
  });

  it("scans exported variable declarations with nested delimiters", () => {
    const result = scanFileText({
      filePath: "src/variables.ts",
      text: [
        "export const A = {",
        "  nested: [1, 2, fn({ a: 1, b: [3, 4] })],",
        "  value: callOne(callTwo({ x: 1 }))",
        "}, B = makeThing(",
        "  1,",
        "  2,",
        "  3",
        ");",
        "export const C = [",
        "  { a: 1 },",
        "  [2, 3]",
        "];",
        "export const D = transform(",
        "  alpha,",
        "  beta",
        ")",
        "export const E = \"done\";"
      ].join("\n")
    });

    expect(result.imports).toEqual([]);
    expect(result.exports).toEqual([
      {
        kind: "local",
        exported: "A",
        local: undefined,
        loc: { line: 1, column: 1 }
      },
      {
        kind: "local",
        exported: "B",
        local: undefined,
        loc: { line: 1, column: 1 }
      },
      {
        kind: "local",
        exported: "C",
        local: undefined,
        loc: { line: 9, column: 1 }
      },
      {
        kind: "local",
        exported: "D",
        local: undefined,
        loc: { line: 13, column: 1 }
      },
      {
        kind: "local",
        exported: "E",
        local: undefined,
        loc: { line: 17, column: 1 }
      }
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("does not match keywords inside longer identifiers or import.meta", () => {
    const result = scanFileText({
      filePath: "src/boundaries.ts",
      text: [
        "const important = 1;",
        "const exportsValue = 2;",
        "const required = 3;",
        "const meta = import.meta;",
        'import value from "./module-a";',
        'export { value as renamed } from "./module-b";',
        'const loaded = require("./module-c");'
      ].join("\n")
    });

    expect(result.imports.map(({ specifier, kind }) => ({ specifier, kind }))).toEqual([
      {
        specifier: "./module-a",
        kind: "import"
      },
      {
        specifier: "./module-c",
        kind: "require"
      }
    ]);

    expect(result.exports).toHaveLength(1);

    const [reExport] = result.exports;
    expect(reExport?.kind).toBe("re-export");

    if (reExport?.kind !== "re-export") {
      return;
    }

    expect(reExport.specifier).toBe("./module-b");
    expect(reExport.imported).toBe("value");
    expect(reExport.exported).toBe("renamed");
    expect(reExport.loc).toEqual({
      line: 6,
      column: 34
    });

    expect(result.warnings).toEqual([]);
  });

  it("returns deterministic output for identical input", () => {
    const input = {
      filePath: "src/example.ts",
      text: [
        'import value from "./module-a";',
        'await import(path);',
        'const required = require("./module-b");'
      ].join("\n")
    };

    expect(scanFileText(input)).toEqual(scanFileText(input));
  });
});
