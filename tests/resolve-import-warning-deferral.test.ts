import { describe, expect, it, vi } from "vitest";
import { resolveImport, type Resolver } from "../src/resolvers/resolve-import.js";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";

describe("resolveImport warning deferral", () => {
  it("does not emit warnings when a later resolver succeeds", async () => {
    const onWarning = vi.fn();
    const resolvers: ReadonlyArray<Resolver> = [
      {
        name: "first",
        resolve: async () => ({
          type: "unresolved",
          warning: "Missing mapping for ./shared"
        })
      },
      {
        name: "second",
        resolve: async () => ({
          type: "resolved",
          path: "src/shared.ts",
          resolver: "second"
        })
      }
    ];

    const result = await resolveImport(
      "./shared",
      "src/app.ts",
      {
        fs: createMemoryFileSystem(),
        onWarning
      },
      resolvers
    );

    expect(result).toEqual({
      type: "resolved",
      path: "src/shared.ts",
      resolver: "second"
    });
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("emits the last useful warning when every resolver fails", async () => {
    const onWarning = vi.fn();
    const resolvers: ReadonlyArray<Resolver> = [
      {
        name: "first",
        resolve: async () => ({
          type: "unresolved",
          warning: "Not a first resolver match"
        })
      },
      {
        name: "second",
        resolve: async () => ({
          type: "unresolved",
          warning: "No source file matched ./shared"
        })
      }
    ];

    const result = await resolveImport(
      "./shared",
      "src/app.ts",
      {
        fs: createMemoryFileSystem(),
        onWarning
      },
      resolvers
    );

    expect(result).toEqual({
      type: "unresolved",
      warning: "Unable to resolve ./shared from src/app.ts"
    });
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledWith({
      resolver: "second",
      warning: "No source file matched ./shared",
      specifier: "./shared",
      fromFile: "src/app.ts",
      importKind: "import"
    });
  });
});
