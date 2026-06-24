import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeFileSystem } from "../src/filesystem/node-filesystem.js";
import { runCli } from "../src/cli.js";

const execFileAsync = promisify(execFile);

type GitRepoState = {
  repoRoot: string;
  configPath: string;
  base: string;
  head: string;
};

let tempDir: string | null = null;

const fs = createNodeFileSystem();

const runGit = async (cwd: string, args: ReadonlyArray<string>): Promise<string> => {
  const result = await execFileAsync("git", args, { cwd });
  return String(result.stdout);
};

const writeFixture = async (root: string, entries: Record<string, string>) => {
  for (const [path, content] of Object.entries(entries)) {
    await fs.writeFile(join(root, path), content);
  }
};

const createGitRepo = async (): Promise<GitRepoState> => {
  tempDir = await mkdtemp(join(tmpdir(), "sniffler-git-"));
  const repoRoot = tempDir;
  const configPath = join(repoRoot, ".sniffler/config.json");

  await runGit(repoRoot, ["init"]);
  await runGit(repoRoot, ["config", "user.name", "Sniffler Test"]);
  await runGit(repoRoot, ["config", "user.email", "sniffler@example.com"]);
  await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);

  await writeFixture(repoRoot, {
    ".sniffler/config.json": JSON.stringify(
      {
        source: {
          roots: ["src"],
          extensions: [".ts"],
          ignore: []
        },
        tests: {
          manifest: ".sniffler/test-map.json"
        },
        output: {
          format: "text"
        }
      },
      null,
      2
    ),
    ".sniffler/test-map.json": JSON.stringify(
      {
        tests: [
          {
            test: "e2e/page.spec.ts",
            targets: ["src/page.ts"]
          }
        ]
      },
      null,
      2
    ),
    "src/shared.ts": "export const shared = true;\n",
    "src/feature.ts": [
      'import { shared } from "./shared.ts";',
      "export const feature = shared;\n"
    ].join("\n"),
    "src/page.ts": [
      'import { feature } from "./feature.ts";',
      "export const page = feature;\n"
    ].join("\n"),
    "src/unrelated.ts": "export const unrelated = true;\n"
  });

  await runGit(repoRoot, ["add", "."]);
  await runGit(repoRoot, ["commit", "-m", "baseline"]);
  const base = (await runGit(repoRoot, ["rev-parse", "HEAD"])).trim();

  await writeFixture(repoRoot, {
    "src/shared.ts": "export const shared = false;\n",
    "src/unrelated.ts": "export const unrelated = false;\n"
  });

  await runGit(repoRoot, ["add", "."]);
  await runGit(repoRoot, ["commit", "-m", "update shared and unrelated"]);
  const head = (await runGit(repoRoot, ["rev-parse", "HEAD"])).trim();

  return {
    repoRoot,
    configPath,
    base,
    head
  };
};

const withWorkingDirectory = async <T>(cwd: string, fn: () => Promise<T>): Promise<T> => {
  const previousCwd = process.cwd();
  process.chdir(cwd);

  try {
    return await fn();
  } finally {
    process.chdir(previousCwd);
  }
};

afterEach(async () => {
  if (tempDir !== null) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("real git diff mode", () => {
  it("resolves impact from a real git diff in base/head mode", async () => {
    const { repoRoot, configPath, base, head } = await createGitRepo();
    const output: string[] = [];

    await withWorkingDirectory(repoRoot, async () => {
      const result = await runCli(
        ["impact", "--base", base, "--head", head, "--format", "json", "--config", configPath],
        {
          stdout: (chunk) => {
            output.push(chunk);
          },
          stderr: (chunk) => {
            output.push(chunk);
          }
        },
        { cwd: repoRoot }
      );

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(output.join(""))).toEqual({
        changedFiles: ["src/shared.ts", "src/unrelated.ts"],
        affectedModules: ["src/feature.ts", "src/page.ts", "src/shared.ts", "src/unrelated.ts"],
        recommendedTests: [
          {
            test: "e2e/page.spec.ts",
            reasons: [
              {
                changedFile: "src/shared.ts",
                declaredTarget: "src/page.ts",
                dependencyPath: ["src/shared.ts", "src/feature.ts", "src/page.ts"]
              }
            ]
          }
        ],
        warnings: []
      });
    });
  });

  it("passes real git diff selections through run mode", async () => {
    const { repoRoot, configPath, base, head } = await createGitRepo();
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const output: string[] = [];

    await withWorkingDirectory(repoRoot, async () => {
      const result = await runCli(
        ["run", "--base", base, "--head", head, "--config", configPath, "--", "pnpm", "vitest", "run"],
        {
          stdout: (chunk) => {
            output.push(chunk);
          },
          stderr: (chunk) => {
            output.push(chunk);
          }
        },
        { cwd: repoRoot, runner }
      );

      expect(result.exitCode).toBe(0);
      expect(runner).toHaveBeenCalledWith({
        command: "pnpm",
        args: ["vitest", "run", "e2e/page.spec.ts"],
        cwd: repoRoot
      });
      expect(output).toEqual([]);
    });
  });
});
