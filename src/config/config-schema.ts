export type SnifflerConfig = {
  source?: {
    roots?: ReadonlyArray<string>;
    extensions?: ReadonlyArray<string>;
    ignore?: ReadonlyArray<string>;
  };
  workspaces?: {
    strategies?: ReadonlyArray<"package-json" | "pnpm-workspace">;
  };
  resolver?: {
    tsconfig?: string;
  };
  tests?: {
    manifest?: string;
  };
  cache?: {
    path?: string;
  };
  output?: {
    format?: "text" | "json";
  };
};

export const defaultConfigPath = ".sniffler/config.json";
