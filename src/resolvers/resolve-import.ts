import type { FileSystem } from "../filesystem/filesystem.js";

export type ResolveContext = {
  fs: FileSystem;
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
