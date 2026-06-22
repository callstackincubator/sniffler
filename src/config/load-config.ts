import type { FileSystem } from "../filesystem/filesystem.js";
import {
  defaultConfig,
  defaultConfigPath,
  type SnifflerConfig,
  type SnifflerCacheStaleStrategy,
  type SnifflerConfigFile,
  type SnifflerOutputFormat,
  type SnifflerWorkspaceStrategy
} from "./config-schema.js";

export type SnifflerConfigLoadErrorCode =
  | "SNIFFLER_CONFIG_NOT_FOUND"
  | "SNIFFLER_INVALID_CONFIG";

export type SnifflerConfigLoadError = Error & {
  code: SnifflerConfigLoadErrorCode;
  path: string;
  cause?: unknown;
};

export type LoadConfigInput = {
  fs: FileSystem;
  configPath?: string;
};

export type LoadConfigResult = {
  configPath: string;
  config: SnifflerConfig;
};

const createLoadError = (
  code: SnifflerConfigLoadErrorCode,
  path: string,
  message: string,
  cause?: unknown
): SnifflerConfigLoadError => {
  const error = new Error(message) as SnifflerConfigLoadError;
  error.name = "SnifflerConfigLoadError";
  error.code = code;
  error.path = path;

  if (cause !== undefined) {
    error.cause = cause;
  }

  return error;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isString = (value: unknown): value is string => {
  return typeof value === "string";
};

const isStringArray = (value: unknown): value is ReadonlyArray<string> => {
  return Array.isArray(value) && value.every(isString);
};

const isWorkspaceStrategyArray = (value: unknown): value is ReadonlyArray<SnifflerWorkspaceStrategy> => {
  return (
    Array.isArray(value) &&
    value.every((entry) => entry === "package-json" || entry === "pnpm-workspace")
  );
};

const isOutputFormat = (value: unknown): value is SnifflerOutputFormat => {
  return value === "text" || value === "json";
};

const isCacheStaleStrategy = (value: unknown): value is SnifflerCacheStaleStrategy => {
  return value === "content" || value === "metadata";
};

const validateConfig = (value: unknown, path: string): SnifflerConfigFile => {
  if (!isRecord(value)) {
    throw createLoadError(
      "SNIFFLER_INVALID_CONFIG",
      path,
      `Invalid config in ${path}: expected a JSON object.`
    );
  }

  if ("$schema" in value && value.$schema !== undefined && !isString(value.$schema)) {
    throw createLoadError(
      "SNIFFLER_INVALID_CONFIG",
      path,
      `Invalid config in ${path}: $schema must be a string when present.`
    );
  }

  if ("source" in value && value.source !== undefined) {
    if (!isRecord(value.source)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: source must be an object when present.`
      );
    }

    if ("roots" in value.source && value.source.roots !== undefined && !isStringArray(value.source.roots)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: source.roots must be an array of strings.`
      );
    }

    if (
      "extensions" in value.source &&
      value.source.extensions !== undefined &&
      !isStringArray(value.source.extensions)
    ) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: source.extensions must be an array of strings.`
      );
    }

    if ("ignore" in value.source && value.source.ignore !== undefined && !isStringArray(value.source.ignore)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: source.ignore must be an array of strings.`
      );
    }

    if (
      "includeNodeModules" in value.source &&
      value.source.includeNodeModules !== undefined &&
      typeof value.source.includeNodeModules !== "boolean"
    ) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: source.includeNodeModules must be a boolean.`
      );
    }
  }

  if ("workspaces" in value && value.workspaces !== undefined) {
    if (!isRecord(value.workspaces)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: workspaces must be an object when present.`
      );
    }

    if (
      "strategies" in value.workspaces &&
      value.workspaces.strategies !== undefined &&
      !isWorkspaceStrategyArray(value.workspaces.strategies)
    ) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: workspaces.strategies must contain only package-json or pnpm-workspace.`
      );
    }
  }

  if ("resolver" in value && value.resolver !== undefined) {
    if (!isRecord(value.resolver)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: resolver must be an object when present.`
      );
    }

    if ("tsconfig" in value.resolver && value.resolver.tsconfig !== undefined && !isString(value.resolver.tsconfig)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: resolver.tsconfig must be a string.`
      );
    }

    if ("conditions" in value.resolver && value.resolver.conditions !== undefined) {
      if (!isRecord(value.resolver.conditions)) {
        throw createLoadError(
          "SNIFFLER_INVALID_CONFIG",
          path,
          `Invalid config in ${path}: resolver.conditions must be an object when present.`
        );
      }

      if (
        "import" in value.resolver.conditions &&
        value.resolver.conditions.import !== undefined &&
        !isStringArray(value.resolver.conditions.import)
      ) {
        throw createLoadError(
          "SNIFFLER_INVALID_CONFIG",
          path,
          `Invalid config in ${path}: resolver.conditions.import must be an array of strings.`
        );
      }

      if (
        "require" in value.resolver.conditions &&
        value.resolver.conditions.require !== undefined &&
        !isStringArray(value.resolver.conditions.require)
      ) {
        throw createLoadError(
          "SNIFFLER_INVALID_CONFIG",
          path,
          `Invalid config in ${path}: resolver.conditions.require must be an array of strings.`
        );
      }
    }
  }

  if ("tests" in value && value.tests !== undefined) {
    if (!isRecord(value.tests)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: tests must be an object when present.`
      );
    }

    if ("manifest" in value.tests && value.tests.manifest !== undefined && !isString(value.tests.manifest)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: tests.manifest must be a string.`
      );
    }
  }

  if ("cache" in value && value.cache !== undefined) {
    if (!isRecord(value.cache)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: cache must be an object when present.`
      );
    }

    if ("path" in value.cache && value.cache.path !== undefined && !isString(value.cache.path)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: cache.path must be a string.`
      );
    }

    if ("stale" in value.cache && value.cache.stale !== undefined && !isCacheStaleStrategy(value.cache.stale)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: cache.stale must be "content" or "metadata".`
      );
    }
  }

  if ("output" in value && value.output !== undefined) {
    if (!isRecord(value.output)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: output must be an object when present.`
      );
    }

    if ("format" in value.output && value.output.format !== undefined && !isOutputFormat(value.output.format)) {
      throw createLoadError(
        "SNIFFLER_INVALID_CONFIG",
        path,
        `Invalid config in ${path}: output.format must be "text" or "json".`
      );
    }
  }

  return value as SnifflerConfigFile;
};

const normalizeConfig = (config: SnifflerConfigFile): SnifflerConfig => {
  return {
    source: {
      roots: config.source?.roots ?? defaultConfig.source?.roots,
      extensions: config.source?.extensions ?? defaultConfig.source?.extensions,
      ignore: config.source?.ignore ?? defaultConfig.source?.ignore,
      includeNodeModules: config.source?.includeNodeModules ?? defaultConfig.source?.includeNodeModules
    },
    workspaces: {
      strategies: config.workspaces?.strategies ?? defaultConfig.workspaces?.strategies
    },
    resolver: {
      tsconfig: config.resolver?.tsconfig ?? defaultConfig.resolver?.tsconfig,
      conditions: {
        import: config.resolver?.conditions?.import ?? defaultConfig.resolver?.conditions?.import,
        require: config.resolver?.conditions?.require ?? defaultConfig.resolver?.conditions?.require
      }
    },
    tests: {
      manifest: config.tests?.manifest ?? defaultConfig.tests?.manifest
    },
    cache: {
      path: config.cache?.path ?? defaultConfig.cache?.path,
      stale: config.cache?.stale ?? defaultConfig.cache?.stale
    },
    output: {
      format: config.output?.format ?? defaultConfig.output?.format
    }
  };
};

export const loadConfig = async (input: LoadConfigInput): Promise<LoadConfigResult> => {
  const configPath = input.configPath ?? defaultConfigPath;

  if (!(await input.fs.exists(configPath))) {
    throw createLoadError(
      "SNIFFLER_CONFIG_NOT_FOUND",
      configPath,
      `Config file not found at ${configPath}. Create it or pass --config <path>.`
    );
  }

  let rawConfig: unknown;

  try {
    rawConfig = await input.fs.readJson<unknown>(configPath);
  } catch (error) {
    throw createLoadError(
      "SNIFFLER_INVALID_CONFIG",
      configPath,
      `Invalid config in ${configPath}.`,
      error
    );
  }

  const config = normalizeConfig(validateConfig(rawConfig, configPath));

  return {
    configPath,
    config
  };
};
