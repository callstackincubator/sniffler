import type { FileSystem } from "../filesystem/filesystem.js";
import { isSnifflerInvalidJsonError } from "../filesystem/filesystem.js";

type LegacyTestMapEntry = {
  test: string;
  targets: ReadonlyArray<string>;
};

type LegacyTestMap = {
  tests: ReadonlyArray<LegacyTestMapEntry>;
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

const isLegacyTestMapEntry = (value: unknown): value is LegacyTestMapEntry => {
  if (!isRecord(value)) {
    return false;
  }

  const test = value.test;
  const targets = value.targets;

  return "test" in value && isString(test) && test.length > 0 && "targets" in value && isStringArray(targets);
};

const isLegacyTestMap = (value: unknown): value is LegacyTestMap => {
  if (!isRecord(value)) {
    return false;
  }

  const tests = value.tests;

  return "tests" in value && Array.isArray(tests) && tests.every(isLegacyTestMapEntry);
};

export const convertTestMap = async (fs: FileSystem, path: string): Promise<void> => {
  if (!(await fs.exists(path))) {
    return;
  }

  let value: unknown;

  try {
    value = await fs.readJson<unknown>(path);
  } catch (error) {
    if (isSnifflerInvalidJsonError(error)) {
      return;
    }

    throw error;
  }

  if (Array.isArray(value)) {
    return;
  }

  if (!isLegacyTestMap(value)) {
    return;
  }

  const converted = value.tests.map((entry) => ({
    test: entry.test,
    dependsOn: [...entry.targets]
  }));

  await fs.writeFile(path, `${JSON.stringify(converted, null, 2)}\n`);
};
