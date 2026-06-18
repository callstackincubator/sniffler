import type { FileSystem } from "../filesystem/filesystem.js";
import { builtinModules } from "node:module";
import type { WorkspacePackage } from "../workspaces/discover-workspaces.js";

export type TsconfigPathsMapping = Record<string, ReadonlyArray<string>>;
export type TsconfigPathsConfig = {
  baseUrl?: string;
  paths?: TsconfigPathsMapping;
};

export type ResolveImportKind = "import" | "require";

export type CompiledTsconfigPathsEntry = {
  pattern: string;
  prefix: string;
  suffix: string;
  replacements: ReadonlyArray<string>;
};

export type CompiledTsconfigPathsConfig = {
  baseUrl?: string;
  entries: ReadonlyArray<CompiledTsconfigPathsEntry>;
};

export type ResolveContext = {
  fs: FileSystem;
  workspacePackages?: ReadonlyArray<WorkspacePackage>;
  workspacePackagesByName?: ReadonlyMap<string, WorkspacePackage>;
  sourceExtensions?: ReadonlyArray<string>;
  tsconfigPaths?: TsconfigPathsConfig;
  tsconfigPathsIndex?: CompiledTsconfigPathsConfig;
  conditions?: {
    import?: ReadonlyArray<string>;
    require?: ReadonlyArray<string>;
  };
  importKind?: ResolveImportKind;
  resolutionCache?: Map<string, ResolveResult>;
};

export type ResolveResult =
  | {
      type: "resolved";
      path: string;
      resolver: string;
    }
  | {
      type: "external";
    }
  | {
      type: "unresolved";
      warning: string;
    };

export type Resolver = {
  name: string;
  resolve: (specifier: string, fromFile: string, context: ResolveContext) => Promise<ResolveResult>;
};

export const compileTsconfigPathsConfig = (
  config: TsconfigPathsConfig
): CompiledTsconfigPathsConfig | undefined => {
  const paths = config.paths;

  if (paths === undefined) {
    return undefined;
  }

  const entries = Object.entries(paths).map(([pattern, replacements]) => {
    const starIndex = pattern.indexOf("*");

    return {
      pattern,
      prefix: starIndex === -1 ? pattern : pattern.slice(0, starIndex),
      suffix: starIndex === -1 ? "" : pattern.slice(starIndex + 1),
      replacements
    };
  });

  if (entries.length === 0) {
    return undefined;
  }

  return {
    baseUrl: config.baseUrl,
    entries
  };
};

export const buildResolutionCacheKey = (
  specifier: string,
  fromFile: string,
  importKind: ResolveImportKind
): string => {
  return `${importKind}\u0000${fromFile}\u0000${specifier}`;
};

export const resolveImport = async (
  specifier: string,
  fromFile: string,
  context: ResolveContext,
  resolvers: ReadonlyArray<Resolver> = []
): Promise<ResolveResult> => {
  const importKind = context.importKind ?? "import";
  const cacheKey = buildResolutionCacheKey(specifier, fromFile, importKind);

  if (context.resolutionCache?.has(cacheKey)) {
    return context.resolutionCache.get(cacheKey) as ResolveResult;
  }

  const bareSpecifier = !specifier.startsWith("./") && !specifier.startsWith("../") && !specifier.startsWith("/");

  if (
    bareSpecifier &&
    (builtinModules.includes(specifier) || builtinModules.includes(`node:${specifier}`))
  ) {
    const result: ResolveResult = { type: "external" };
    context.resolutionCache?.set(cacheKey, result);
    return result;
  }

  for (const resolver of resolvers) {
    const result = await resolver.resolve(specifier, fromFile, context);
    if (result.type !== "unresolved") {
      context.resolutionCache?.set(cacheKey, result);
      return result;
    }
  }

  const result: ResolveResult = {
    type: "unresolved",
    warning: `Unable to resolve ${specifier} from ${fromFile}`
  };
  context.resolutionCache?.set(cacheKey, result);
  return result;
};
