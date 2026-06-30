import type { FileSystem } from "../filesystem/filesystem.js";

export type TestMapEntry = {
  test: string;
  dependsOn: ReadonlyArray<string>;
};

export type TestMap = ReadonlyArray<TestMapEntry>;

export type TestMapLoadErrorCode = "SNIFFLER_TEST_MAP_NOT_FOUND" | "SNIFFLER_INVALID_TEST_MAP";

export type TestMapLoadError = Error & {
  code: TestMapLoadErrorCode;
  path: string;
  cause?: unknown;
};

const createLoadError = (
  code: TestMapLoadErrorCode,
  path: string,
  message: string,
  cause?: unknown
): TestMapLoadError => {
  const error = new Error(message) as TestMapLoadError;
  error.name = "TestMapLoadError";
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

const validateTestMap = (value: unknown, path: string): TestMap => {
  if (!Array.isArray(value)) {
    throw createLoadError(
      "SNIFFLER_INVALID_TEST_MAP",
      path,
      `Invalid test map in ${path}: expected a JSON array of tests.`
    );
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw createLoadError(
        "SNIFFLER_INVALID_TEST_MAP",
        path,
        `Invalid test map in ${path}: [${index}] must be an object.`
      );
    }

    const test = entry.test;
    const dependsOn = entry.dependsOn;

    if (!("test" in entry) || !isString(test) || test.length === 0) {
      throw createLoadError(
        "SNIFFLER_INVALID_TEST_MAP",
        path,
        `Invalid test map in ${path}: [${index}].test must be a non-empty string.`
      );
    }

    if (!("dependsOn" in entry) || !isStringArray(dependsOn)) {
      throw createLoadError(
        "SNIFFLER_INVALID_TEST_MAP",
        path,
        `Invalid test map in ${path}: [${index}].dependsOn must be an array of strings.`
      );
    }

    return {
      test,
      dependsOn: [...dependsOn]
    };
  });
};

export const loadTestMap = async (fs: FileSystem, path: string): Promise<TestMap> => {
  if (!(await fs.exists(path))) {
    throw createLoadError(
      "SNIFFLER_TEST_MAP_NOT_FOUND",
      path,
      `Test map file not found at ${path}. Create it or update tests.manifest.`
    );
  }

  let rawTestMap: unknown;

  try {
    rawTestMap = await fs.readJson<unknown>(path);
  } catch (error) {
    throw createLoadError(
      "SNIFFLER_INVALID_TEST_MAP",
      path,
      `Invalid test map in ${path}.`,
      error
    );
  }

  const testMap = validateTestMap(rawTestMap, path);

  return testMap;
};
