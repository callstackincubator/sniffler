import type { FileSystem } from "../filesystem/filesystem.js";
import { builtinModules } from "node:module";
import type { WorkspacePackage } from "../workspaces/discover-workspaces.js";

export type TsconfigPathsMapping = Record<string, ReadonlyArray<string>>;
export type TsconfigPathsConfig = {
  baseUrl?: string;
  paths?: TsconfigPathsMapping;
};

export type ResolveImportKind = "import" | "require";

export type ResolveContext = {
  fs: FileSystem;
  workspacePackages?: ReadonlyArray<WorkspacePackage>;
  tsconfigPaths?: TsconfigPathsConfig;
  conditions?: {
    import?: ReadonlyArray<string>;
    require?: ReadonlyArray<string>;
  };
  importKind?: ResolveImportKind;
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

export const resolveImport = async (
  specifier: string,
  fromFile: string,
  context: ResolveContext,
  resolvers: ReadonlyArray<Resolver> = []
): Promise<ResolveResult> => {
  const bareSpecifier = !specifier.startsWith("./") && !specifier.startsWith("../") && !specifier.startsWith("/");

  if (
    bareSpecifier &&
    (builtinModules.includes(specifier) || builtinModules.includes(`node:${specifier}`))
  ) {
    return { type: "external" };
  }

  for (const resolver of resolvers) {
    const result = await resolver.resolve(specifier, fromFile, context);
    if (result.type !== "unresolved") {
      return result;
    }
  }

  return {
    type: "unresolved",
    warning: `Unable to resolve ${specifier} from ${fromFile}`
  };
};
