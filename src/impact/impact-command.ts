import { join } from "node:path";
import type { GraphCache } from "../cache/cache-types.js";
import type { GraphCacheStore } from "../cache/cache-store.js";
import { createContentHashStaleChecker, createMetadataStaleChecker, type StaleChecker } from "../cache/stale-checker.js";
import type { SnifflerConfig, SnifflerOutputFormat } from "../config/config-schema.js";
import { loadConfig } from "../config/load-config.js";
import { normalizePath } from "../filesystem/path-utils.js";
import { createNodeFileSystem } from "../filesystem/node-filesystem.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import { noopDiagnostics, type Diagnostics } from "../diagnostics/diagnostics.js";
import { renderJsonOutput } from "../output/json-output.js";
import type { ImpactOutput } from "../output/output-types.js";
import { renderTextOutput } from "../output/text-output.js";
import { convertTestMap } from "../test-map/convert-test-map.js";
import { loadTestMap } from "../test-map/load-test-map.js";
import { resolveChangedFiles } from "./changed-files.js";
import { prepareImpactGraph } from "./graph-workflow.js";
import { selectImpactTests } from "./selection.js";
import { resolveRunAllReasons, selectRunAllRecommendation } from "../test-map/recommend-tests.js";

export type ImpactCommandInput = {
  base?: string;
  head?: string;
  changedFiles?: ReadonlyArray<string>;
  configPath?: string;
  format?: SnifflerOutputFormat;
  platform?: string;
};

export type SelectImpactInput = ImpactCommandInput;

export type ImpactCommandResult = {
  exitCode: number;
  output: string;
  impact?: ImpactOutput;
};

export type GitDiffProvider = (input: {
  base: string;
  head: string;
  cwd: string;
}) => Promise<ReadonlyArray<string>>;

export type ImpactCommandDeps = {
  fs?: FileSystem;
  cwd?: string;
  gitDiff?: GitDiffProvider;
  diagnostics?: Diagnostics;
  staleChecker?: StaleChecker;
  cacheStoreFactory?: (input: { cache: GraphCache | null; staleChecker: StaleChecker }) => GraphCacheStore;
};

const sortUniqueStrings = (values: ReadonlyArray<string>): Array<string> => {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
};

const getFs = (deps: ImpactCommandDeps): FileSystem => {
  return deps.fs ?? createNodeFileSystem();
};

const getCwd = (deps: ImpactCommandDeps): string => {
  return normalizePath(deps.cwd ?? process.cwd());
};

const normalizePlatform = (platform?: string): string | undefined => {
  const trimmed = platform?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const loadStaleChecker = (fs: FileSystem, config: SnifflerConfig): StaleChecker => {
  return config.cache?.stale === "metadata" ? createMetadataStaleChecker(fs) : createContentHashStaleChecker(fs);
};

const recordImpactSummary = (
  diagnostics: Diagnostics,
  input: {
    changedFiles: ReadonlyArray<string>;
    affectedModules: ReadonlyArray<string>;
    recommendedTests: ReadonlyArray<ImpactOutput["recommendedTests"][number]>;
    warnings: ReadonlyArray<string>;
  }
): void => {
  diagnostics.record("changedFiles", input.changedFiles.length);
  diagnostics.record("affectedModules", input.affectedModules.length);
  diagnostics.record("recommendedTests", input.recommendedTests.length);
  diagnostics.record("warnings", input.warnings.length);
};

export const selectImpact = async (
  input: SelectImpactInput,
  deps: ImpactCommandDeps
): Promise<ImpactOutput> => {
  const fs = getFs(deps);
  const cwd = getCwd(deps);
  const diagnostics = deps.diagnostics ?? noopDiagnostics;
  const config = (
    await diagnostics.time("impact.config.load", async () => {
      return await loadConfig({ fs, configPath: input.configPath });
    })
  ).config;
  const testMapPath = normalizePath(join(cwd, config.tests?.manifest ?? ".sniffler/test-map.json"));
  await convertTestMap(fs, testMapPath);
  const changedFiles = await diagnostics.time("impact.changedFiles.resolve", async () => {
    return await resolveChangedFiles(input, deps, cwd);
  });
  const runAllReasons = resolveRunAllReasons(changedFiles, config.tests?.runAllWhenChanged ?? []);
  if (runAllReasons.length > 0) {
    const runAllSelection = await diagnostics.time("impact.testMap.load", async () => {
      const testMap = await loadTestMap(fs, testMapPath);
      return selectRunAllRecommendation(testMap, runAllReasons);
    });

    recordImpactSummary(diagnostics, {
      changedFiles,
      affectedModules: [],
      recommendedTests: runAllSelection.recommendedTests,
      warnings: []
    });

    return {
      changedFiles: sortUniqueStrings(changedFiles),
      affectedModules: [],
      recommendedTests: runAllSelection.recommendedTests,
      warnings: []
    };
  }

  const graphResult = await prepareImpactGraph({
    fs,
    cwd,
    config,
    diagnostics,
    staleChecker: deps.staleChecker ?? loadStaleChecker(fs, config),
    cacheStoreFactory: deps.cacheStoreFactory,
    platform: normalizePlatform(input.platform)
  });
  const selection = await selectImpactTests({
    fs,
    config,
    testMapPath,
    graph: graphResult.graph,
    changedFiles,
    diagnostics
  });
  recordImpactSummary(diagnostics, {
    changedFiles,
    affectedModules: selection.affectedModules,
    recommendedTests: selection.recommendedTests,
    warnings: graphResult.warnings
  });

  return {
    changedFiles: sortUniqueStrings(changedFiles),
    affectedModules: selection.affectedModules,
    recommendedTests: selection.recommendedTests,
    warnings: sortUniqueStrings(graphResult.warnings)
  };
};

export const runImpactCommand = async (
  input: ImpactCommandInput,
  deps: ImpactCommandDeps
): Promise<ImpactCommandResult> => {
  const output = await selectImpact(input, deps);
  const fs = getFs(deps);
  const config = (await loadConfig({ fs, configPath: input.configPath })).config;
  const format = input.format ?? config.output?.format ?? "text";
  const rendered = await (deps.diagnostics ?? noopDiagnostics).time("impact.output.render", async () => {
    return format === "json" ? renderJsonOutput(output) : renderTextOutput(output);
  });

  return {
    exitCode: 0,
    output: rendered,
    impact: output
  };
};
