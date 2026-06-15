import { describe, expect, it } from "vitest";
import { scanFileText } from "../src/scanner/scan-file.js";

describe("scanFileText", () => {
  it("collects static imports, exports, requires, and literal dynamic imports", () => {
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
        loc: { line: 1, column: 31 }
      },
      {
        specifier: "./module-b",
        kind: "import",
        loc: { line: 2, column: 28 }
      },
      {
        specifier: "./module-c",
        kind: "export",
        loc: { line: 3, column: 26 }
      },
      {
        specifier: "./module-d",
        kind: "export",
        loc: { line: 4, column: 15 }
      },
      {
        specifier: "./module-e",
        kind: "require",
        loc: { line: 5, column: 26 }
      },
      {
        specifier: "./module-f",
        kind: "dynamic-import",
        loc: { line: 6, column: 14 }
      },
      {
        specifier: "./module-g",
        kind: "dynamic-import",
        loc: { line: 7, column: 26 }
      }
    ]);

    expect(result.warnings).toEqual([]);
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
