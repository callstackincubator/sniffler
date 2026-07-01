import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { normalizePath } from "../filesystem/path-utils.js";
import { scanFileText } from "./scan-file.js";

type WorkerInput = {
  cwd: string;
};

type WorkerJob = {
  id: number;
  path: string;
};

type WorkerResult = {
  type: "result";
  id: number;
  result: {
    path: string;
    scan: ReturnType<typeof scanFileText>;
    contentHash: string;
    metadata: {
      size: number;
      mtimeMs: number;
    };
  };
};

type WorkerError = {
  type: "error";
  id: number;
  path: string;
  message: string;
};

const hashText = (text: string): string => {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
};

const input = workerData as WorkerInput;
const port = parentPort;

if (port === null) {
  throw new Error("source-scan-worker requires a parent port");
}

port.on("message", async (job: WorkerJob) => {
  const path = normalizePath(job.path);
  const resolvedPath = join(input.cwd, path);

  try {
    const [text, fileStat] = await Promise.all([readFile(resolvedPath, "utf8"), stat(resolvedPath)]);

    const result: WorkerResult = {
      type: "result",
      id: job.id,
      result: {
        path,
        scan: scanFileText({ filePath: path, text }),
        contentHash: hashText(text),
        metadata: {
          size: fileStat.size,
          mtimeMs: fileStat.mtimeMs
        }
      }
    };

    port.postMessage(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    const result: WorkerError = {
      type: "error",
      id: job.id,
      path,
      message
    };
    port.postMessage(result);
  }
});
