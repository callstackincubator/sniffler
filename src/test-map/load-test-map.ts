import type { FileSystem } from "../filesystem/filesystem.js";

export type TestMapTarget = string;

export type TestMapEntry = {
  test: string;
  targets: ReadonlyArray<TestMapTarget>;
};

export type TestMap = {
  tests: ReadonlyArray<TestMapEntry>;
};

export type TestMapFile = TestMap & {
  $schema?: string;
};

export const loadTestMap = async (_fs: FileSystem, _path: string): Promise<TestMap> => {
  return {
    tests: []
  };
};
