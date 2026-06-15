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

export type FileSystem = {
  readFile: (path: string) => Promise<string>;
  readJson: <T>(path: string) => Promise<T>;
  exists: (path: string) => Promise<boolean>;
  glob: (patterns: ReadonlyArray<string>, options: GlobOptions) => Promise<Array<string>>;
  stat: (path: string) => Promise<FileStat>;
  writeFile: (path: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
};
