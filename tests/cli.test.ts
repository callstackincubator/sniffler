import { describe, expect, it } from "vitest";
import { renderHelp, runCli } from "../src/cli.js";

describe("CLI scaffold", () => {
  it("renders top-level help", () => {
    expect(renderHelp()).toContain("sniffler");
    expect(renderHelp()).toContain("impact");
  });

  it("prints help and exits cleanly for --help", async () => {
    const output: string[] = [];

    const result = await runCli(["--help"], {
      stdout: (chunk) => {
        output.push(chunk);
      },
      stderr: (chunk) => {
        output.push(chunk);
      }
    });

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("Usage:");
  });

  it("prints impact help", async () => {
    const output: string[] = [];

    const result = await runCli(["impact", "--help"], {
      stdout: (chunk) => {
        output.push(chunk);
      },
      stderr: (chunk) => {
        output.push(chunk);
      }
    });

    expect(result.exitCode).toBe(0);
    expect(output.join("")).toContain("sniffler impact");
  });
});
