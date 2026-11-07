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

  it("handles tabs, CRLF line endings, and identifier boundaries", () => {
    const result = scanFileText({
      filePath: "src/whitespace.ts",
      text: [
        'import\tvalue\tfrom\t"./tabbed";\r\n',
        'const imported = 1;\r\n',
        'await import\t("./dynamic");\r\n',
        'const requirement = 2;\r\n',
        'export\t{ imported as renamed }\tfromage\t"./ignored";\r\n',
        'export\t{ imported as renamed }\tfrom\t"./reexport";\r\n'
      ].join("")
    });

    expect(result.imports).toEqual([
      {
        specifier: "./tabbed",
        kind: "import",
        loc: { line: 1, column: 19 },
        entities: {
          type: "named",
          entities: [
            {
              imported: "default",
              local: "value"
            }
          ]
        }
      },
      {
        specifier: "./dynamic",
        kind: "dynamic-import",
        loc: { line: 3, column: 15 },
        entities: {
          type: "all"
        }
      }
    ]);

    expect(result.exports).toEqual([
      {
        kind: "local",
        exported: "renamed",
        local: "imported",
        loc: { line: 5, column: 1 }
      },
      {
        kind: "re-export",
        specifier: "./reexport",
        imported: "imported",
        exported: "renamed",
        loc: { line: 6, column: 37 }
      }
    ]);

    expect(result.warnings).toEqual([]);
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

describe("scanFileText type-only imports and exports", () => {
  const scanSpecifiers = (lines: string[]) => {
    const result = scanFileText({ filePath: "src/example.ts", text: lines.join("\n") });

    return {
      imports: result.imports.map((entry) => ({ specifier: entry.specifier, entities: entry.entities })),
      reExports: result.exports.filter((entry) => entry.kind !== "local")
    };
  };

  it("skips type-only import statements because they are erased at build time", () => {
    const actual = scanSpecifiers([
      'import type { Value } from "./named";',
      'import type Default from "./default";',
      'import type * as Namespace from "./namespace";',
      'import type {',
      "  Multi,",
      "  Line",
      '} from "./multi-line";',
      'import value from "./runtime";'
    ]);

    expect(actual.imports).toEqual([
      {
        specifier: "./runtime",
        entities: { type: "named", entities: [{ imported: "default", local: "value" }] }
      }
    ]);
  });

  it("skips type-only re-exports because they are erased at build time", () => {
    const actual = scanSpecifiers([
      'export type { Value } from "./named";',
      'export type * from "./star";',
      'export type * as Namespace from "./namespace";',
      'export { runtime } from "./runtime";'
    ]);

    expect(actual.imports).toEqual([]);
    expect(actual.reExports).toEqual([
      {
        kind: "re-export",
        specifier: "./runtime",
        imported: "runtime",
        exported: "runtime",
        loc: { line: 4, column: 25 }
      }
    ]);
  });

  it("keeps local type exports without a from clause", () => {
    const result = scanFileText({
      filePath: "src/example.ts",
      text: ["type Value = string;", "export type { Value };"].join("\n")
    });

    expect(result.exports).toEqual([
      { kind: "local", exported: "Value", local: undefined, loc: { line: 2, column: 1 } }
    ]);
  });

  it("treats a default import or binding named type as a runtime import", () => {
    const actual = scanSpecifiers([
      'import type from "./default-named-type";',
      'import type, { helper } from "./default-named-type-with-named";',
      'import { type } from "./named-type";',
      'import { type as alias } from "./aliased-type";'
    ]);

    expect(actual.imports).toEqual([
      {
        specifier: "./default-named-type",
        entities: { type: "named", entities: [{ imported: "default", local: "type" }] }
      },
      {
        specifier: "./default-named-type-with-named",
        entities: {
          type: "named",
          entities: [{ imported: "default", local: "type" }, { imported: "helper" }]
        }
      },
      {
        specifier: "./named-type",
        entities: { type: "named", entities: [{ imported: "type" }] }
      },
      {
        specifier: "./aliased-type",
        entities: { type: "named", entities: [{ imported: "type", local: "alias" }] }
      }
    ]);
  });

  it("skips imports whose specifiers are all inline type-only", () => {
    const actual = scanSpecifiers([
      'import { type A, type B as C } from "./all-types";',
      'import Default, { type D } from "./default-with-type";'
    ]);

    expect(actual.imports).toEqual([
      {
        specifier: "./default-with-type",
        entities: { type: "named", entities: [{ imported: "default", local: "Default" }] }
      }
    ]);
  });

  it("keeps imports that mix inline type-only and runtime specifiers, selecting only the runtime ones", () => {
    const actual = scanSpecifiers(['import { type A, b, type C as D, e as f } from "./mixed";']);

    expect(actual.imports).toEqual([
      {
        specifier: "./mixed",
        entities: { type: "named", entities: [{ imported: "b" }, { imported: "e", local: "f" }] }
      }
    ]);
  });

  it("keeps empty import lists and side-effect imports", () => {
    const actual = scanSpecifiers(['import {} from "./empty";', 'import "./side-effect";']);

    expect(actual.imports).toEqual([
      { specifier: "./empty", entities: { type: "named", entities: [] } },
      { specifier: "./side-effect", entities: { type: "all" } }
    ]);
  });

  it("drops inline type-only specifiers from re-exports", () => {
    const actual = scanSpecifiers([
      'export { type A, b } from "./mixed";',
      'export { type C } from "./all-types";'
    ]);

    expect(actual.reExports).toEqual([
      {
        kind: "re-export",
        specifier: "./mixed",
        imported: "b",
        exported: "b",
        loc: { line: 1, column: 27 }
      }
    ]);
  });
});
