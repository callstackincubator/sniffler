export type FileStat = {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
};

export type GlobOptions = {
  cwd?: string;
  dot?: boolean;
};

export type SnifflerInvalidJsonError = Error & {
  code: "SNIFFLER_INVALID_JSON";
  path: string;
  cause?: SyntaxError;
};

export type FileSystem = {
  readFile: (path: string) => Promise<string>;
  readJson: <T>(path: string) => Promise<T>;
  exists: (path: string) => Promise<boolean>;
  glob: (patterns: ReadonlyArray<string>, options: GlobOptions) => Promise<Array<string>>;
  stat: (path: string) => Promise<FileStat>;
  writeFile: (path: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
};

export const createInvalidJsonError = (path: string, cause: unknown): SnifflerInvalidJsonError => {
  const error = new Error(`Invalid JSON in ${path}`) as SnifflerInvalidJsonError;
  error.name = "SnifflerInvalidJsonError";
  error.code = "SNIFFLER_INVALID_JSON";
  error.path = path;

  if (cause instanceof SyntaxError) {
    error.cause = cause;
  }

  return error;
};

export const isSnifflerInvalidJsonError = (value: unknown): value is SnifflerInvalidJsonError => {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code?: unknown }).code === "SNIFFLER_INVALID_JSON" &&
    "path" in value &&
    typeof (value as { path?: unknown }).path === "string"
  );
};
