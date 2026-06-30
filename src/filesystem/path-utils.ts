import { posix as pathPosix } from "node:path";

export const normalizePath = (path: string): string => {
  return pathPosix.normalize(path.replaceAll("\\", "/"));
};

export const parentDirectories = (path: string): Array<string> => {
  const normalized = normalizePath(path);
  const parts = normalized.split("/").filter((part) => part.length > 0);
  const parents: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    parents.push(parts.slice(0, index).join("/"));
  }

  return parents;
};

export const isPathWithinDirectory = (path: string, directory: string): boolean => {
  const normalizedPath = normalizePath(path);
  const normalizedDirectory = normalizePath(directory);

  return (
    normalizedPath === normalizedDirectory ||
    normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
};

export const createGlobMatcher = (pattern: string): ((path: string) => boolean) => {
  const normalizedPattern = normalizePath(pattern);
  let regex = "^";

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];

    if (char === "*") {
      if (normalizedPattern[index + 1] === "*") {
        if (normalizedPattern[index + 2] === "/") {
          regex += "(?:.*/)?";
          index += 2;
        } else {
          regex += ".*";
          index += 1;
        }
      } else {
        regex += "[^/]*";
      }

      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegExp(char);
  }

  regex += "$";
  const matcher = new RegExp(regex);

  return (path: string) => matcher.test(normalizePath(path));
};
