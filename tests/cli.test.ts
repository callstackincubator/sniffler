import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { createSniffler } from "../src/create-sniffler.js";
import { isMainModule, runCli } from "../src/cli.js";

const createFixtureFileSystem = (
  testMapTargets: ReadonlyArray<string> = ["src/feature.ts"],
  options: {
    extraEntries?: Record<string, string>;
    config?: Record<string, unknown>;
    includeScannerWarning?: boolean;
  } = {}
) => {
  const includeScannerWarning = options.includeScannerWarning === true;

  return createMemoryFileSystem({
    ".sniffler/config.json": JSON.stringify({
      output: {
        format: "text"
      },
      ...(options.config ?? {}),
      tests: {
        manifest: ".sniffler/test-map.json"
      }
    }),
    ".sniffler/test-map.json": JSON.stringify({
      tests: [
        {
          test: "e2e/feature.spec.ts",
          targets: testMapTargets
        }
      ]
    }),
    "src/feature.ts": includeScannerWarning
      ? [
          "const path = getPath();",
          "await import(path);",
          'import "./shared.ts";',
          "export const feature = true;"
        ].join("\n")
      : [
          'import "./shared.ts";',
          "export const feature = true;"
        ].join("\n"),
    "src/shared.ts": "export const shared = true;",
    ...(options.extraEntries ?? {})
  });
};

const createPlatformFixtureFileSystem = () => {
  return createMemoryFileSystem({
    ".sniffler/config.json": JSON.stringify({
      output: {
        format: "text"
      },
      source: {
        roots: ["src"],
        extensions: [".ts"],
        ignore: []
      },
      tests: {
        manifest: ".sniffler/test-map.json"
      }
    }),
    ".sniffler/test-map.json": JSON.stringify({
      tests: [
        {
          test: "e2e/app.spec.ts",
          targets: ["src/app.ts"]
        }
      ]
    }),
    "src/app.ts": [
      'import "./Button";',
      "export const app = true;"
    ].join("\n"),
    "src/Button.ts": "export const Button = true;",
    "src/Button.android.ts": "export const Button = true;",
    "src/Button.native.ts": "export const Button = true;",
    "src/Button.ios.ts": "export const Button = true;"
  });
};

describe("CLI impact command", () => {
  it("treats a symlinked bin path as the main module", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sniffler-cli-"));
    const targetPath = join(tempDir, "cli.js");
    const symlinkPath = join(tempDir, "sniffler");

    writeFileSync(targetPath, "export {};\n");
    symlinkSync(targetPath, symlinkPath);

    expect(isMainModule(pathToFileURL(targetPath).href, symlinkPath)).toBe(true);
  });

  it("renders text output for positional changed files", async () => {
    const fs = createFixtureFileSystem();
    const output: string[] = [];

    const result = await runCli(
      ["impact", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Changed files:");
    expect(output.join("")).toContain("src/shared.ts");
    expect(output.join("")).toContain("Recommended E2E tests:");
    expect(output.join("")).toContain("e2e/feature.spec.ts");
    expect(output.join("")).toContain("path: src/shared.ts -> src/feature.ts");
  });

  it("does not write diagnostics by default", async () => {
    const fs = createFixtureFileSystem();

    const result = await runCli(
      ["impact", "src/shared.ts"],
      {
        stdout: () => {},
        stderr: () => {}
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(await fs.exists(".sniffler/diagnostics.json")).toBe(false);
  });

  it("writes diagnostics when enabled", async () => {
    const fs = createFixtureFileSystem(["src/feature.ts"], { includeScannerWarning: true });
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--diagnostics", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Recommended E2E tests:");
    expect(output.join("")).not.toContain("diagnostics.json");
    expect(await fs.exists(".sniffler/diagnostics.json")).toBe(true);

    const diagnostics = await fs.readJson<{
      version: number;
      status: string;
      stages: Array<{ name: string; durationMs: number }>;
      warnings: Array<{
        source: string;
        resolver?: string;
        type?: string;
        kind?: string;
        message: string;
        file: string;
        specifier?: string;
        importKind?: string;
        location?: { line: number; column: number };
      }>;
      metrics: Record<string, number | string | boolean>;
    }>(".sniffler/diagnostics.json");
    expect(diagnostics).toMatchObject({
      version: 1,
      status: "success",
      warnings: [
        {
          source: "scanner",
          type: "unresolved-dynamic-import",
          file: "src/feature.ts",
          message: "src/feature.ts:2 dynamic import target is not statically resolvable",
          location: {
            line: 2,
            column: 14
          }
        }
      ],
      metrics: {
        sourceFiles: 2,
        cacheEntries: 0,
        cacheScanHits: 0,
        cacheScanMisses: 2,
        cachedResolvedEdgeFiles: 0,
        graphNodes: 2,
        changedFiles: 1,
        affectedModules: 2,
        recommendedTests: 1,
        warnings: 1
      }
    });

    expect(Array.isArray(diagnostics.stages)).toBe(true);
    expect(diagnostics.stages.map((stage) => stage.name)).toEqual(
      expect.arrayContaining([
        "impact.config.load",
        "impact.changedFiles.resolve",
        "impact.workspaces.discover",
        "impact.tsconfig.load",
        "impact.sources.discover",
        "impact.sources.scan",
        "impact.graph.build",
        "impact.traverse",
        "impact.testMap.load",
        "impact.tests.match"
      ])
    );
  });

  it("does not discover node_modules sources by default", async () => {
    const fs = createFixtureFileSystem(
      ["src/feature.ts"],
      {
        extraEntries: {
          "node_modules/pkg/index.ts": "export const pkg = true;",
          "apps/web/node_modules/pkg/index.ts": "export const nestedPkg = true;"
        }
      }
    );
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--diagnostics", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Recommended E2E tests:");

    const diagnostics = await fs.readJson<{
      metrics: Record<string, number | string | boolean>;
    }>(".sniffler/diagnostics.json");
    expect(diagnostics.metrics.sourceFiles).toBe(2);
  });

  it("includes node_modules sources when explicitly enabled", async () => {
    const fs = createFixtureFileSystem(
      ["src/feature.ts", "node_modules/pkg/index.ts"],
      {
        config: {
          source: {
            includeNodeModules: true
          }
        },
        extraEntries: {
          "node_modules/pkg/index.ts": "export const pkg = true;"
        }
      }
    );
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--diagnostics", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Recommended E2E tests:");
    const diagnostics = await fs.readJson<{
      metrics: Record<string, number | string | boolean>;
    }>(".sniffler/diagnostics.json");
    expect(diagnostics.metrics.sourceFiles).toBe(3);
  });

  it("renders text output for multiple positional changed files", async () => {
    const fs = createFixtureFileSystem(["src/shared.ts", "src/feature.ts"]);
    const output: string[] = [];

    const result = await runCli(
      ["impact", "src/shared.ts", "src/feature.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("src/shared.ts");
    expect(output.join("")).toContain("src/feature.ts");
  });

  it("renders text output for legacy --changed files", async () => {
    const fs = createFixtureFileSystem();
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--changed", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("src/shared.ts");
    expect(output.join("")).toContain("Recommended E2E tests:");
  });

  it("renders JSON output for base/head mode", async () => {
    const fs = createFixtureFileSystem();
    const gitDiff = vi.fn(async () => ["src/shared.ts"]);
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--base", "origin/main", "--head", "HEAD", "--format", "json"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: ".", gitDiff }
    );

    expect(result.exitCode).toBe(0);
    expect(gitDiff).toHaveBeenCalledWith({
      base: "origin/main",
      head: "HEAD",
      cwd: expect.any(String)
    });

    expect(JSON.parse(output.join(""))).toEqual({
      changedFiles: ["src/shared.ts"],
      affectedModules: ["src/feature.ts", "src/shared.ts"],
      recommendedTests: [
        {
          test: "e2e/feature.spec.ts",
          reasons: [
            {
              changedFile: "src/shared.ts",
              declaredTarget: "src/feature.ts",
              dependencyPath: ["src/shared.ts", "src/feature.ts"]
            }
          ]
        }
      ],
      warnings: []
    });
  });

  it("accepts platform-aware impact resolution", async () => {
    const fs = createPlatformFixtureFileSystem();
    const output: string[] = [];

    const result = await runCli(
      ["impact", "--platform", "android", "src/Button.android.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("e2e/app.spec.ts");
    expect(output.join("")).toContain("src/Button.android.ts -> src/app.ts");
  });

  it("rejects no selection", async () => {
    const fs = createFixtureFileSystem();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["impact"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("Provide changed files or both --base and --head");
    expect(stdout.join("")).toContain("sniffler impact");
  });

  it("rejects partial git refs", async () => {
    const fs = createFixtureFileSystem();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["impact", "--base", "origin/main"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("--base and --head must be provided together");
    expect(stdout.join("")).toContain("sniffler impact");
  });

  it("rejects mixed selection", async () => {
    const fs = createFixtureFileSystem();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["impact", "src/shared.ts", "--base", "origin/main", "--head", "HEAD"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("Use changed files or --base/--head, not both");
    expect(stdout.join("")).toContain("sniffler impact");
  });

  it("rejects unknown options", async () => {
    const fs = createFixtureFileSystem();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["impact", "--mystery", "src/shared.ts"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("Unknown option `--mystery`");
    expect(stdout.join("")).toContain("sniffler impact");
  });

  it("validates --format", async () => {
    const fs = createFixtureFileSystem();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["impact", "src/shared.ts", "--format", "xml"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("--format must be either text or json");
    expect(stdout.join("")).toContain("sniffler impact");
  });

  it("exits successfully when no tests are mapped", async () => {
    const fs = createFixtureFileSystem(["src/unrelated.ts"]);
    const output: string[] = [];

    const result = await runCli(
      ["impact", "src/shared.ts"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Recommended E2E tests:");
    expect(output.join("")).toContain("none");
  });

  it("exposes the impact API from the top-level factory", async () => {
    const fs = createFixtureFileSystem();
    const sniffler = createSniffler({ fs, cwd: "." });

    const result = await sniffler.impact({
      changedFiles: ["src/shared.ts"]
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("e2e/feature.spec.ts");
  });
});

describe("CLI run command", () => {
  it("appends selected tests to the runner args", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const output: string[] = [];

    const result = await runCli(
      ["run", "src/shared.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(runner).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["vitest", "run", "e2e/feature.spec.ts"],
      cwd: expect.any(String)
    });
    expect(output).toEqual([]);
  });

  it("accepts platform-aware run resolution", async () => {
    const fs = createPlatformFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const output: string[] = [];

    const result = await runCli(
      ["run", "--platform", "android", "src/Button.android.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(runner).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["vitest", "run", "e2e/app.spec.ts"],
      cwd: expect.any(String)
    });
    expect(output).toEqual([]);
  });

  it("does not write diagnostics by default", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));

    const result = await runCli(
      ["run", "src/shared.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: () => {},
        stderr: () => {}
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(await fs.exists(".sniffler/diagnostics.json")).toBe(false);
  });

  it("writes diagnostics when enabled and preserves runner invocation", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));

    const result = await runCli(
      ["run", "--diagnostics", "src/shared.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: () => {},
        stderr: () => {}
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(runner).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["vitest", "run", "e2e/feature.spec.ts"],
      cwd: expect.any(String)
    });
    expect(await fs.exists(".sniffler/diagnostics.json")).toBe(true);

    const diagnostics = await fs.readJson<{
      version: number;
      status: string;
      stages: Array<{ name: string; durationMs: number }>;
      metrics: Record<string, number | string | boolean>;
    }>(".sniffler/diagnostics.json");
    expect(diagnostics).toMatchObject({
      version: 1,
      status: "success",
      metrics: {
        sourceFiles: 2,
        affectedModules: 2,
        recommendedTests: 1,
        warnings: 0
      }
    });
    expect(Array.isArray(diagnostics.stages)).toBe(true);
    expect(diagnostics.stages.map((stage) => stage.name)).toEqual(
      expect.arrayContaining(["impact.config.load", "run.runner.execute"])
    );
  });

  it("appends selected tests to the runner args in base/head mode", async () => {
    const fs = createFixtureFileSystem();
    const gitDiff = vi.fn(async () => ["src/shared.ts"]);
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const output: string[] = [];

    const result = await runCli(
      ["run", "--base", "origin/main", "--head", "HEAD", "--", "pnpm", "vitest", "run"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: ".", gitDiff, runner }
    );

    expect(result.exitCode).toBe(0);
    expect(gitDiff).toHaveBeenCalledWith({
      base: "origin/main",
      head: "HEAD",
      cwd: expect.any(String)
    });
    expect(runner).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["vitest", "run", "e2e/feature.spec.ts"],
      cwd: expect.any(String)
    });
    expect(output).toEqual([]);
  });

  it("appends selected tests to the runner args for legacy --changed syntax", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));

    const result = await runCli(
      ["run", "--changed", "src/shared.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: () => {},
        stderr: () => {}
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(runner).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["vitest", "run", "e2e/feature.spec.ts"],
      cwd: expect.any(String)
    });
  });

  it("returns the runner exit code", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 7 }));

    const result = await runCli(
      ["run", "src/shared.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: () => {},
        stderr: () => {}
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(7);
  });

  it("skips the runner when no tests are mapped", async () => {
    const fs = createFixtureFileSystem(["src/unrelated.ts"]);
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const output: string[] = [];

    const result = await runCli(
      ["run", "src/shared.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: (chunk) => {
          output.push(chunk);
        },
        stderr: (chunk) => {
          output.push(chunk);
        }
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(0);
    expect(runner).not.toHaveBeenCalled();
    expect(output).toEqual([]);
  });

  it("rejects missing --", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["run", "--base", "origin/main", "--head", "HEAD", "pnpm", "vitest", "run"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(1);
    expect(runner).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("sniffler run requires a runner command after --");
    expect(stdout.join("")).toContain("sniffler run");
  });

  it("rejects empty runner", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["run", "--base", "origin/main", "--head", "HEAD", "--"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(1);
    expect(runner).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("sniffler run requires a runner command after --");
    expect(stdout.join("")).toContain("sniffler run");
  });

  it("rejects unknown options", async () => {
    const fs = createFixtureFileSystem();
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["run", "--mystery", "src/shared.ts", "--", "pnpm", "vitest", "run"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: ".", runner }
    );

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("Unknown option: --mystery");
    expect(stdout.join("")).toContain("sniffler run");
  });
});

describe("CLI help", () => {
  it("routes help through injected stdout", async () => {
    const fs = createFixtureFileSystem();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["--help"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(stdout.join("")).toContain("sniffler");
    expect(stderr).toEqual([]);
  });

  it("routes version through injected stdout", async () => {
    const fs = createFixtureFileSystem();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(
      ["--version"],
      {
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: (chunk) => {
          stderr.push(chunk);
        }
      },
      { fs, cwd: "." }
    );

    expect(result.exitCode).toBe(0);
    expect(stdout.join("")).toContain("0.0.0");
    expect(stderr).toEqual([]);
  });
});
