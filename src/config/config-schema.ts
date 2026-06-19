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
    conditions?: {
      import?: ReadonlyArray<string>;
      require?: ReadonlyArray<string>;
    };
  };
  tests?: {
    manifest?: string;
  };
  cache?: {
    path?: string;
    stale?: "content" | "metadata";
  };
  output?: {
    format?: "text" | "json";
  };
};

export type SnifflerConfigFile = SnifflerConfig & {
  $schema?: string;
};

export const defaultConfigPath = ".sniffler/config.json";

export const defaultConfig = {
  source: {
    roots: ["."],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    ignore: []
  },
  workspaces: {
    strategies: ["package-json", "pnpm-workspace"]
  },
  resolver: {
    tsconfig: "tsconfig.json",
    conditions: {
      import: ["import", "node", "default"],
      require: ["require", "node", "default"]
    }
  },
  tests: {
    manifest: ".sniffler/test-map.json"
  },
  cache: {
    path: ".sniffler/cache.json",
    stale: "content"
  },
  output: {
    format: "text"
  }
} satisfies SnifflerConfig;

export type SnifflerWorkspaceStrategy = "package-json" | "pnpm-workspace";
export type SnifflerOutputFormat = "text" | "json";
export type SnifflerCacheStaleStrategy = "content" | "metadata";
