import { describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { convertTestMap } from "../src/test-map/convert-test-map.js";
import { loadTestMap } from "../src/test-map/load-test-map.js";

describe("loadTestMap", () => {
  it("loads and validates a test map manifest", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/test-map.json": JSON.stringify([
        {
          test: "e2e/checkout.spec.ts",
          dependsOn: ["apps/mobile/src/screens/CheckoutScreen.tsx", "packages/checkout/src/**"]
        }
      ])
    });

    const result = await loadTestMap(fs, ".sniffler/test-map.json");

    expect(result).toEqual([
      {
        test: "e2e/checkout.spec.ts",
        dependsOn: ["apps/mobile/src/screens/CheckoutScreen.tsx", "packages/checkout/src/**"]
      }
    ]);
  });

  it("converts legacy object manifests to arrays", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/test-map.json": JSON.stringify({
        tests: [
          {
            test: "e2e/checkout.spec.ts",
            targets: ["apps/mobile/src/screens/CheckoutScreen.tsx"]
          }
        ]
      })
    });

    await convertTestMap(fs, ".sniffler/test-map.json");

    expect(await fs.readJson(".sniffler/test-map.json")).toEqual([
      {
        test: "e2e/checkout.spec.ts",
        dependsOn: ["apps/mobile/src/screens/CheckoutScreen.tsx"]
      }
    ]);
  });

  it("does nothing for array manifests", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/test-map.json": JSON.stringify([
        {
          test: "e2e/checkout.spec.ts",
          dependsOn: ["apps/mobile/src/screens/CheckoutScreen.tsx"]
        }
      ])
    });
    const writeFileSpy = vi.spyOn(fs, "writeFile");

    await convertTestMap(fs, ".sniffler/test-map.json");

    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(await fs.readJson(".sniffler/test-map.json")).toEqual([
      {
        test: "e2e/checkout.spec.ts",
        dependsOn: ["apps/mobile/src/screens/CheckoutScreen.tsx"]
      }
    ]);
  });

  it("fails with an actionable error when the manifest file is missing", async () => {
    const fs = createMemoryFileSystem();

    await expect(loadTestMap(fs, ".sniffler/test-map.json")).rejects.toMatchObject({
      code: "SNIFFLER_TEST_MAP_NOT_FOUND",
      path: ".sniffler/test-map.json"
    });
  });

  it("fails with an actionable error when the manifest structure is invalid", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/test-map.json": JSON.stringify([
        {
          test: "e2e/checkout.spec.ts",
          dependsOn: ["apps/mobile/src/screens/CheckoutScreen.tsx", 123]
        }
      ])
    });

    await expect(loadTestMap(fs, ".sniffler/test-map.json")).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_TEST_MAP",
      path: ".sniffler/test-map.json"
    });
  });

  it("fails with an actionable error when the manifest JSON is invalid", async () => {
    const fs = createMemoryFileSystem({
      ".sniffler/test-map.json": "{"
    });

    await expect(loadTestMap(fs, ".sniffler/test-map.json")).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_TEST_MAP",
      path: ".sniffler/test-map.json"
    });
  });
});
