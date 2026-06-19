import { performance } from "node:perf_hooks";
import { join } from "node:path";
import type { FileSystem } from "../filesystem/filesystem.js";
import { normalizePath } from "../filesystem/path-utils.js";

export type DiagnosticsStatus = "success" | "error";

export type DiagnosticsStage = {
  name: string;
  durationMs: number;
};

export type DiagnosticsPayload = {
  version: 1;
  generatedAt: string;
  status: DiagnosticsStatus;
  durationMs: number;
  stages: ReadonlyArray<DiagnosticsStage>;
  metrics: Record<string, number | string | boolean>;
};

export type Diagnostics = {
  time<T>(name: string, action: () => Promise<T>): Promise<T>;
  record(name: string, value: number | string | boolean): void;
  increment(name: string, amount?: number): void;
  flush(input?: { status?: DiagnosticsStatus; error?: string }): Promise<void>;
};

const outputPath = ".sniffler/diagnostics.json";

export const noopDiagnostics: Diagnostics = {
  time: async <T>(_name: string, action: () => Promise<T>): Promise<T> => {
    return await action();
  },
  record: () => {},
  increment: () => {},
  flush: async () => {}
};

export const createDiagnostics = (input: {
  enabled: boolean;
  fs: FileSystem;
  cwd: string;
}): Diagnostics => {
  if (!input.enabled) {
    return noopDiagnostics;
  }

  const startedAt = performance.now();
  const generatedAt = new Date().toISOString();
  const stages: DiagnosticsStage[] = [];
  const metrics = new Map<string, number | string | boolean>();
  let flushed = false;

  return {
    time: async <T>(name: string, action: () => Promise<T>): Promise<T> => {
      const stageStartedAt = performance.now();

      try {
        return await action();
      } finally {
        stages.push({
          name,
          durationMs: performance.now() - stageStartedAt
        });
      }
    },
    record: (name: string, value: number | string | boolean) => {
      metrics.set(name, value);
    },
    increment: (name: string, amount = 1) => {
      const current = metrics.get(name);
      const next = typeof current === "number" ? current + amount : amount;
      metrics.set(name, next);
    },
    flush: async (context?: { status?: DiagnosticsStatus; error?: string }) => {
      if (flushed) {
        return;
      }

      flushed = true;

      if (context?.error !== undefined) {
        metrics.set("error", true);
      }

      const payload: DiagnosticsPayload = {
        version: 1,
        generatedAt,
        status: context?.status ?? "success",
        durationMs: performance.now() - startedAt,
        stages,
        metrics: Object.fromEntries(metrics)
      };

      const path = normalizePath(join(input.cwd, outputPath));

      await input.fs.writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
    }
  };
};
