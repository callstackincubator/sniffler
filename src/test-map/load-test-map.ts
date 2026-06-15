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

const validateTestMap = (value: unknown, path: string): TestMapFile => {
  if (!isRecord(value)) {
    throw createLoadError(
      "SNIFFLER_INVALID_TEST_MAP",
      path,
      `Invalid test map in ${path}: expected a JSON object with a tests array.`
    );
  }

  if (!("tests" in value) || !Array.isArray(value.tests)) {
    throw createLoadError(
      "SNIFFLER_INVALID_TEST_MAP",
      path,
      `Invalid test map in ${path}: tests must be an array.`
    );
  }

  value.tests.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw createLoadError(
        "SNIFFLER_INVALID_TEST_MAP",
        path,
        `Invalid test map in ${path}: tests[${index}] must be an object.`
      );
    }

    if (!("test" in entry) || !isString(entry.test) || entry.test.length === 0) {
      throw createLoadError(
        "SNIFFLER_INVALID_TEST_MAP",
        path,
        `Invalid test map in ${path}: tests[${index}].test must be a non-empty string.`
      );
    }

    if (!("targets" in entry) || !isStringArray(entry.targets)) {
      throw createLoadError(
        "SNIFFLER_INVALID_TEST_MAP",
        path,
        `Invalid test map in ${path}: tests[${index}].targets must be an array of strings.`
      );
    }
  });

  return value as TestMapFile;
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

  return {
    tests: testMap.tests.map((entry) => ({
      test: entry.test,
      targets: entry.targets
    }))
  };
};
