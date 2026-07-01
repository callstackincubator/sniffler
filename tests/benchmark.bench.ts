import { bench, expect } from "vitest";
import { createMemoryFileSystem } from "../src/filesystem/memory-filesystem.js";
import { selectImpact } from "../src/impact/impact-command.js";

const BRANCH_COUNT = 120;
const BRANCH_DEPTH = 12;
const TARGET_MEASURED_MS = 1_500;

type BenchmarkScenario = {
  name: string;
  changedFiles: ReadonlyArray<string>;
  expectedAffectedModules: number;
  expectedRecommendedTests: number;
};

const formatIndex = (value: number): string => {
  return String(value).padStart(3, "0");
};

const sortPaths = (values: ReadonlyArray<string>): Array<string> => {
  return [...values].sort((left, right) => left.localeCompare(right));
};

const buildBenchmarkFileSystem = () => {
  const entries: Record<string, string> = {
    "package.json": JSON.stringify({ name: "sniffler-benchmark" }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: "." } }),
    ".sniffler/config.json": JSON.stringify({
      workers: 0,
      source: {
        roots: ["src"],
        extensions: [".ts"],
        ignore: []
      },
      workspaces: {
        strategies: []
      },
      resolver: {
        tsconfig: "tsconfig.json"
      },
      tests: {
        manifest: ".sniffler/test-map.json"
      },
      cache: {
        path: ".sniffler/cache.json"
      },
      output: {
        format: "json"
      }
    })
  };

  const tests = Array.from({ length: BRANCH_COUNT }, (_, branchIndex) => {
    const branch = formatIndex(branchIndex);
    const branchRoot = `src/branches/branch-${branch}`;
    const branchEntry = `${branchRoot}/step-${formatIndex(BRANCH_DEPTH - 1)}.ts`;

    for (let step = 0; step < BRANCH_DEPTH; step += 1) {
      const filePath = `${branchRoot}/step-${formatIndex(step)}.ts`;
      const importLine =
        step === 0
          ? 'import "../../shared/root.ts";'
          : `import "./step-${formatIndex(step - 1)}.ts";`;

      entries[filePath] = [importLine, `export const step${formatIndex(step)} = ${branchIndex * BRANCH_DEPTH + step};`].join(
        "\n"
      );
    }

    return {
      test: `e2e/branch-${branch}.spec.ts`,
      targets: [branchEntry]
    };
  });

  entries["src/shared/root.ts"] = "export const sharedRoot = true;";
  entries[".sniffler/test-map.json"] = JSON.stringify({ tests });

  return createMemoryFileSystem(entries);
};

const buildScenarios = (): Array<BenchmarkScenario> => {
  const branch0 = `src/branches/branch-${formatIndex(0)}`;
  const branch0Leaf = `${branch0}/step-000.ts`;
  const sharedRoot = "src/shared/root.ts";

  return [
    {
      name: "shared-root",
      changedFiles: [sharedRoot],
      expectedAffectedModules: 1 + BRANCH_COUNT * BRANCH_DEPTH,
      expectedRecommendedTests: BRANCH_COUNT
    },
    {
      name: "deep-branch",
      changedFiles: [branch0Leaf],
      expectedAffectedModules: BRANCH_DEPTH,
      expectedRecommendedTests: 1
    }
  ];
};

const getScenarioName = (scenario: BenchmarkScenario): string => {
  return `${scenario.name} [${1 + BRANCH_COUNT * BRANCH_DEPTH} files]`;
};

const fileSystem = buildBenchmarkFileSystem();

for (const scenario of buildScenarios()) {
  const changedFiles = sortPaths(scenario.changedFiles);
  const input = {
    changedFiles,
    format: "json" as const
  };
  const baseline = await selectImpact(input, { fs: fileSystem, cwd: "." });

  expect(baseline.changedFiles).toEqual(changedFiles);
  expect(baseline.affectedModules).toHaveLength(scenario.expectedAffectedModules);
  expect(baseline.recommendedTests).toHaveLength(scenario.expectedRecommendedTests);
  expect(baseline.warnings).toEqual([]);

  bench(
    getScenarioName(scenario),
    async () => {
      await selectImpact(input, { fs: fileSystem, cwd: "." });
    },
    {
      iterations: 3,
      time: TARGET_MEASURED_MS
    }
  );
}
