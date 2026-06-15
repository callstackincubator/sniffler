import type { FileSystem } from "../filesystem/filesystem.js";
import { defaultConfigPath, type SnifflerConfig } from "./config-schema.js";

export type LoadConfigInput = {
  fs: FileSystem;
  configPath?: string;
};

export type LoadConfigResult = {
  configPath: string;
  config: SnifflerConfig;
};

const defaultConfig: SnifflerConfig = {};

export const loadConfig = async (input: LoadConfigInput): Promise<LoadConfigResult> => {
  void input.fs;
  return {
    configPath: input.configPath ?? defaultConfigPath,
    config: defaultConfig
  };
};
