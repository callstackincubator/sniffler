import type { FileSystem } from "../filesystem/filesystem.js";

export type TestMapTarget = string;

export type TestMapEntry = {
  test: string;
  targets: ReadonlyArray<TestMapTarget>;
};

export type TestMap = {
  tests: ReadonlyArray<TestMapEntry>;
};

export const loadTestMap = async (_fs: FileSystem, _path: string): Promise<TestMap> => {
  return {
    tests: []
  };
};
