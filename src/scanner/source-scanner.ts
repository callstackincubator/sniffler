import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { SourceFileMetadata } from "../cache/cache-types.js";
import { readSourceFileMetadata } from "../cache/stale-checker.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { normalizePath } from "../filesystem/path-utils.js";
import { scanFileText } from "./scan-file.js";
import type { ScanResult } from "./scanner-types.js";

export type SourceScanOutput = {
  path: string;
  scan: ScanResult;
  contentHash: string;
  metadata?: SourceFileMetadata;
};

export type SourceScanner = {
  mode: "serial" | "worker";
  workers: number;
  scan: (paths: ReadonlyArray<string>) => Promise<ReadonlyArray<SourceScanOutput>>;
};

export type ResolveSourceScannerInput = {
  fs: FileSystem;
  cwd: string;
  workers?: "auto" | number;
  missCount: number;
};

const hashText = (text: string): string => {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
};

const autoWorkerCount = (): number => {
  return Math.max(1, Math.min(Math.max(1, availableParallelism() - 1), 8));
};

export const createSerialSourceScanner = (input: { fs: FileSystem }): SourceScanner => {
  return {
    mode: "serial",
    workers: 0,
    scan: async (paths) => {
      const results: SourceScanOutput[] = [];

      for (const path of paths) {
        const text = await input.fs.readFile(path);
        results.push({
          path: normalizePath(path),
          scan: scanFileText({ filePath: path, text }),
          contentHash: hashText(text),
          metadata: await readSourceFileMetadata(input.fs, path)
        });
      }

      return results;
    }
  };
};

type WorkerJob = {
  id: number;
  path: string;
};

type WorkerMessage =
  | {
      type: "result";
      id: number;
      result: SourceScanOutput;
    }
  | {
      type: "error";
      id: number;
      path: string;
      message: string;
    };

type WorkerState = {
  worker: Worker;
  job: WorkerJob | null;
};

const createWorkerPool = (cwd: string, workerCount: number) => {
  const workerExtension = import.meta.url.includes("/dist/") ? "js" : "ts";
  const workerUrl = new URL(`./source-scan-worker.${workerExtension}`, import.meta.url);
  const workers: WorkerState[] = [];
  const idleWorkers: WorkerState[] = [];
  const pendingJobs: WorkerJob[] = [];
  let terminated = false;
  let settled = false;
  let jobId = 0;
  let rejectCurrent: ((error: Error) => void) | null = null;
  let resolveCurrent: ((value: ReadonlyArray<SourceScanOutput>) => void) | null = null;

  const shutdown = async () => {
    if (terminated) {
      return;
    }

    terminated = true;
    await Promise.all(
      workers.map(async (state) => {
        await state.worker.terminate();
      })
    );
  };

  const settleError = async (error: Error) => {
    if (settled) {
      return;
    }

    settled = true;
    const reject = rejectCurrent;
    rejectCurrent = null;
    resolveCurrent = null;
    pendingJobs.length = 0;
    await shutdown();

    if (reject !== null) {
      reject(error);
    }
  };

  const dispatch = () => {
    while (!settled && idleWorkers.length > 0 && pendingJobs.length > 0) {
      const state = idleWorkers.shift();
      const job = pendingJobs.shift();

      if (state === undefined || job === undefined) {
        return;
      }

      state.job = job;
      state.worker.postMessage(job);
    }
  };

  for (let index = 0; index < workerCount; index += 1) {
    const workerOptions = {
      workerData: { cwd },
      type: "module"
    } as any;
    const worker = new Worker(workerUrl, workerOptions);
    const state: WorkerState = { worker, job: null };

    worker.on("message", (message: WorkerMessage) => {
      if (settled) {
        return;
      }

      const activeJob = state.job;

      if (activeJob === null || activeJob.id !== message.id) {
        return;
      }

      state.job = null;
      idleWorkers.push(state);

      if (message.type === "error") {
        void settleError(new Error(`Failed to scan ${message.path}: ${message.message}`));
        return;
      }

      const pendingResults = currentResults;

      if (pendingResults === null) {
        return;
      }

      pendingResults[message.id] = message.result;
      remainingResults -= 1;

      if (remainingResults === 0 && resolveCurrent !== null) {
        const resolve = resolveCurrent;
        resolveCurrent = null;
        void shutdown().then(() => {
          settled = true;
          resolve(pendingResults);
        });
        return;
      }

      dispatch();
    });
    worker.on("error", async (error) => {
      const activeJob = state.job;
      const message =
        activeJob === null
          ? error
          : new Error(`Failed to scan ${activeJob.path}: ${error.message}`);
      await settleError(message);
    });
    worker.on("exit", async (code) => {
      if (terminated || code === 0 || settled) {
        return;
      }

      const activeJob = state.job;
      await settleError(
        new Error(
          activeJob === null
            ? `Worker exited with code ${code}`
            : `Failed to scan ${activeJob.path}: worker exited with code ${code}`
        )
      );
    });

    workers.push(state);
    idleWorkers.push(state);
  }

  let currentResults: Array<SourceScanOutput> | null = null;
  let remainingResults = 0;

  return {
    scan: async (paths: ReadonlyArray<string>): Promise<ReadonlyArray<SourceScanOutput>> => {
      if (paths.length === 0) {
        await shutdown();
        return [];
      }

      return await new Promise<ReadonlyArray<SourceScanOutput>>((resolve, reject) => {
        settled = false;
        rejectCurrent = reject;
        resolveCurrent = resolve;
        currentResults = new Array<SourceScanOutput>(paths.length);
        remainingResults = paths.length;

        for (const path of paths) {
          const id = jobId;
          jobId += 1;
          const job: WorkerJob = { id, path };

          pendingJobs.push(job);
        }

        dispatch();
      });
    }
  };
};

export const createWorkerSourceScanner = (input: {
  cwd: string;
  workers: number;
}): SourceScanner => {
  return {
    mode: "worker",
    workers: input.workers,
    scan: async (paths) => {
      const pool = createWorkerPool(input.cwd, input.workers);
      return await pool.scan(paths);
    }
  };
};

export const resolveSourceScanner = (input: ResolveSourceScannerInput): SourceScanner => {
  const configuredWorkers = input.workers ?? "auto";

  if (configuredWorkers === 0 || input.missCount === 0) {
    return createSerialSourceScanner({ fs: input.fs });
  }

  if (!input.fs.supportsWorkerScanning) {
    if (configuredWorkers === "auto") {
      return createSerialSourceScanner({ fs: input.fs });
    }

    throw new Error(
      "Selected worker source scanner requires FileSystem.supportsWorkerScanning = true. Use workers: 0 or Node FS."
    );
  }

  if (configuredWorkers === "auto" && input.missCount < 32) {
    return createSerialSourceScanner({ fs: input.fs });
  }

  const workers = configuredWorkers === "auto" ? autoWorkerCount() : configuredWorkers;

  if (!Number.isInteger(workers) || workers < 1) {
    return createSerialSourceScanner({ fs: input.fs });
  }

  return createWorkerSourceScanner({
    cwd: input.cwd,
    workers
  });
};
