import { createHash } from "node:crypto";
import type { SnifflerConfig } from "../config/config-schema.js";

export const SCANNER_VERSION = "scan-file-v1";

const hashValue = (value: string): string => {
  return createHash("sha256").update(value).digest("hex");
};

const toCacheConfigInput = (config: SnifflerConfig): Record<string, unknown> => {
  return {
    source: {
      roots: config.source?.roots ?? [],
      extensions: config.source?.extensions ?? [],
      ignore: config.source?.ignore ?? []
    },
    workspaces: {
      strategies: config.workspaces?.strategies ?? []
    },
    resolver: {
      tsconfig: config.resolver?.tsconfig ?? null,
      conditions: {
        import: config.resolver?.conditions?.import ?? [],
        require: config.resolver?.conditions?.require ?? []
      }
    },
    cache: {
      stale: config.cache?.stale ?? "content"
    }
  };
};

export const getCacheConfigHash = (
  config: SnifflerConfig,
  runtime?: {
    platform?: string;
  }
): string => {
  const platform = runtime?.platform?.trim();
  const configInput = toCacheConfigInput(config);

  if (platform === undefined || platform.length === 0) {
    return hashValue(JSON.stringify(configInput));
  }

  return hashValue(
    JSON.stringify({
      ...configInput,
      platform
    })
  );
};
