import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { defaultConfigPath } from "../src/config/config-schema.js";
import { loadConfig } from "../src/config/load-config.js";

describe("loadConfig", () => {
  it("loads the default config path and applies defaults", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        tests: {
          manifest: "custom/test-map.json"
        }
      })
    });

    const result = await loadConfig({ fs });

    expect(result.configPath).toBe(defaultConfigPath);
    expect(result.config.tests?.manifest).toBe("custom/test-map.json");
    expect(result.config.tests?.sharedTargets).toEqual([]);
    expect(result.config.tests?.runAllWhenChanged).toEqual([]);
    expect((result.config.tests as any)?.invalidateSubtreeWhenTouched).toEqual([]);
    expect(result.config.output?.format).toBe("text");
    expect(result.config.cache?.stale).toBe("content");
    expect(result.config.source?.includeNodeModules).toBe(false);
  });

  it("loads the configured cache stale strategy", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        cache: {
          stale: "metadata"
        }
      })
    });

    const result = await loadConfig({ fs });

    expect(result.config.cache?.stale).toBe("metadata");
  });

  it("loads runAllWhenChanged rules", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        tests: {
          runAllWhenChanged: ["pnpm-lock.yaml", "**/package-lock.json"]
        }
      })
    });

    const result = await loadConfig({ fs });

    expect(result.config.tests?.runAllWhenChanged).toEqual([
      "pnpm-lock.yaml",
      "**/package-lock.json"
    ]);
  });

  it("loads an explicit config path", async () => {
    const fs = createMemoryFileSystem({
      "configs/sniffler.json": JSON.stringify({
        tests: {
          manifest: "custom/test-map.json"
        }
      })
    });

    const result = await loadConfig({ fs, configPath: "configs/sniffler.json" });

    expect(result.configPath).toBe("configs/sniffler.json");
    expect(result.config.tests?.manifest).toBe("custom/test-map.json");
  });

  it("fails with an actionable error when the config file is missing", async () => {
    const fs = createMemoryFileSystem();

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_CONFIG_NOT_FOUND",
      path: defaultConfigPath
    });
  });

  it("fails with an actionable error when the config JSON is invalid", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: "{"
    });

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_CONFIG",
      path: defaultConfigPath
    });
  });

  it("fails with an actionable error when the config shape is invalid", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        output: {
          format: "pretty"
        }
      })
    });

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_CONFIG",
      path: defaultConfigPath
    });
  });

  it("fails with an actionable error when cache.stale is invalid", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        cache: {
          stale: "timestamp"
        }
      })
    });

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_CONFIG",
      path: defaultConfigPath,
      message: expect.stringContaining('cache.stale must be "content" or "metadata"')
    });
  });

  it("fails with an actionable error when source.includeNodeModules is invalid", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        source: {
          includeNodeModules: "yes please"
        }
      })
    });

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_CONFIG",
      path: defaultConfigPath,
      message: expect.stringContaining("source.includeNodeModules must be a boolean")
    });
  });

  it("loads tests.sharedTargets when provided", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        tests: {
          sharedTargets: ["src/global.ts", "src/setup.ts"]
        }
      })
    });

    const result = await loadConfig({ fs });

    expect(result.config.tests?.sharedTargets).toEqual(["src/global.ts", "src/setup.ts"]);
  });

  it("fails with an actionable error when tests.sharedTargets is not a string array", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        tests: {
          sharedTargets: ["src/global.ts", 123]
        }
      })
    });

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_CONFIG",
      path: defaultConfigPath,
      message: expect.stringContaining("tests.sharedTargets must be an array of strings")
    });
  });

  it("fails with an actionable error when runAllWhenChanged is not a string array", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        tests: {
          runAllWhenChanged: ["pnpm-lock.yaml", 42]
        }
      })
    });

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_CONFIG",
      path: defaultConfigPath,
      message: expect.stringContaining("tests.runAllWhenChanged must be an array of strings")
    });
  });

  it("loads tests.invalidateSubtreeWhenTouched when provided", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        tests: {
          invalidateSubtreeWhenTouched: ["src/App.tsx", "src/screens/**/*.tsx"]
        }
      })
    });

    const result = await loadConfig({ fs });

    expect((result.config.tests as any)?.invalidateSubtreeWhenTouched).toEqual([
      "src/App.tsx",
      "src/screens/**/*.tsx"
    ]);
  });

  it("fails with an actionable error when tests.invalidateSubtreeWhenTouched is not a string array", async () => {
    const fs = createMemoryFileSystem({
      [defaultConfigPath]: JSON.stringify({
        tests: {
          invalidateSubtreeWhenTouched: ["src/App.tsx", 42]
        }
      })
    });

    await expect(loadConfig({ fs })).rejects.toMatchObject({
      code: "SNIFFLER_INVALID_CONFIG",
      path: defaultConfigPath,
      message: expect.stringContaining("tests.invalidateSubtreeWhenTouched must be an array of strings")
    });
  });
});
