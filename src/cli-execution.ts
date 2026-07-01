import type { CliIO, CliResult, CliDeps } from "./cli.js";
import { createDiagnostics, noopDiagnostics, type Diagnostics } from "./diagnostics/diagnostics.js";
import { createNodeFileSystem } from "./filesystem/node-filesystem.js";

export type CliExecutionInput = {
  io: CliIO;
  deps: CliDeps;
  diagnosticsEnabled: boolean;
  run: (diagnostics: Diagnostics) => Promise<CliResult & { output?: string }>;
};

const createExecutionDiagnostics = (deps: CliDeps, enabled: boolean): Diagnostics => {
  if (!enabled) {
    return noopDiagnostics;
  }

  return createDiagnostics({
    enabled: true,
    fs: deps.fs ?? createNodeFileSystem(),
    cwd: deps.cwd ?? process.cwd()
  });
};

export const runCliExecution = async (input: CliExecutionInput): Promise<CliResult> => {
  const diagnostics = createExecutionDiagnostics(input.deps, input.diagnosticsEnabled);
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  try {
    const result = await input.run(diagnostics);

    if (result.output !== undefined) {
      input.io.stdout(result.output);
    }

    if (result.exitCode !== 0) {
      status = "error";
      errorMessage = `exit code ${result.exitCode}`;
    }

    return { exitCode: result.exitCode };
  } catch (error) {
    status = "error";
    errorMessage = error instanceof Error ? error.message : String(error);
    input.io.stderr(`${errorMessage}\n`);
    return { exitCode: 1 };
  } finally {
    await diagnostics.flush({
      status,
      error: errorMessage
    });
  }
};
