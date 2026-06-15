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
    expect(result.config.output?.format).toBe("text");
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
});
