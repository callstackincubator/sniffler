#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const expensifyAppRepo = "https://github.com/Expensify/App.git";
const managedClonePath = resolve(repoRoot, ".benchmark-repos/expensify-app");

const parseArgs = (argv) => {
  const options = {
    iterations: 5,
    warmup: 1,
    build: true,
    scenarios: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--iterations") {
      options.iterations = Number.parseInt(argv[++index] ?? "", 10);
      continue;
    }

    if (arg === "--warmup") {
      options.warmup = Number.parseInt(argv[++index] ?? "", 10);
      continue;
    }

    if (arg === "--scenario") {
      options.scenarios.push(parseScenario(argv[++index] ?? ""));
      continue;
    }

    if (arg === "--no-build") {
      options.build = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.iterations) || options.iterations < 1) {
    throw new Error("--iterations must be a positive integer");
  }

  if (!Number.isInteger(options.warmup) || options.warmup < 0) {
    throw new Error("--warmup must be a non-negative integer");
  }

  return options;
};

const parseScenario = (value) => {
  const separator = value.indexOf("=");

  if (separator === -1) {
    throw new Error("--scenario must use name=file[,file...] format");
  }

  const name = value.slice(0, separator).trim();
  const changedFiles = value
    .slice(separator + 1)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (name.length === 0 || changedFiles.length === 0) {
    throw new Error("--scenario must include a name and at least one changed file");
  }

  return { name, changedFiles };
};

const printHelp = () => {
  console.log(
    [
      "Usage: pnpm benchmark:app [options]",
      "",
      "Runs Sniffler's built CLI against an Expensify App checkout.",
      "",
      "Options:",
      "  --iterations <count>          Measured runs per scenario (default: 5)",
      "  --warmup <count>              Warmup runs per scenario (default: 1)",
      "  --scenario <name=file[,file]> Add or replace benchmark scenario; repeatable",
      "  --no-build                    Use existing dist/cli.js instead of running pnpm build",
      "",
      "App checkout:",
      `  Uses ${relative(process.cwd(), managedClonePath)} if it exists, otherwise clones`,
      `  ${expensifyAppRepo} into that directory.`,
      "",
      "Examples:",
      "  pnpm benchmark:app",
      "  pnpm benchmark:app --iterations 10 --warmup 2",
      "  pnpm benchmark:app --scenario onboarding=src/pages/OnboardingPersonalDetails/BaseOnboardingPersonalDetails.tsx"
    ].join("\n")
  );
};

const run = (command, args, options) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe"
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with exit code ${result.status}`,
        result.stdout,
        result.stderr
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return result;
};

const ensureAppCheckout = () => {
  if (existsSync(resolve(managedClonePath, ".git"))) {
    return managedClonePath;
  }

  mkdirSync(dirname(managedClonePath), { recursive: true });
  console.log(`Expensify/App checkout not found. Cloning into ${managedClonePath}`);
  run("git", ["clone", "--depth", "1", expensifyAppRepo, managedClonePath], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  return managedClonePath;
};

const loadDefaultScenarios = (appRoot) => {
  const scenarios = [];
  const manifestPath = resolve(appRoot, ".sniffler/test-map.json");

  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const target = manifest.tests?.find((entry) => Array.isArray(entry.targets) && entry.targets.length > 0)
      ?.targets?.[0];

    if (typeof target === "string") {
      scenarios.push({
        name: "manifest-target",
        changedFiles: [target]
      });
    }
  }

  for (const [name, file] of [
    ["app-entry", "src/App.tsx"],
    ["routes", "src/ROUTES.ts"]
  ]) {
    if (existsSync(resolve(appRoot, file))) {
      scenarios.push({
        name,
        changedFiles: [file]
      });
    }
  }

  const seen = new Set();
  return scenarios.filter((scenario) => {
    const key = `${scenario.name}\0${scenario.changedFiles.join("\0")}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const percentile = (values, percentileValue) => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
};

const summarize = (samples) => {
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  const mean = total / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  return {
    samples,
    min,
    max,
    mean,
    median: percentile(samples, 50),
    p75: percentile(samples, 75),
    p95: percentile(samples, 95)
  };
};

const formatMs = (value) => `${value.toFixed(1)} ms`;

const runScenario = ({ cliPath, appRoot, scenario, iterations, warmup }) => {
  const args = [
    cliPath,
    "impact",
    "--changed",
    ...scenario.changedFiles,
    "--format",
    "json"
  ];
  const samples = [];
  let lastImpact;

  for (let runIndex = 0; runIndex < warmup + iterations; runIndex += 1) {
    const start = performance.now();
    const result = run(process.execPath, args, { cwd: appRoot });
    const duration = performance.now() - start;
    const impact = JSON.parse(result.stdout);

    if (runIndex >= warmup) {
      samples.push(duration);
      lastImpact = impact;
    }
  }

  return {
    ...summarize(samples),
    changedFiles: scenario.changedFiles,
    affectedModules: lastImpact?.affectedModules?.length ?? 0,
    recommendedTests: lastImpact?.recommendedTests?.length ?? 0,
    warnings: lastImpact?.warnings?.length ?? 0
  };
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const appRoot = ensureAppCheckout();
  const configPath = resolve(appRoot, ".sniffler/config.json");
  const cliPath = resolve(repoRoot, "dist/cli.js");

  if (!existsSync(configPath)) {
    throw new Error(`Sniffler config not found: ${configPath}`);
  }

  if (options.build) {
    run("pnpm", ["build"], { cwd: repoRoot, stdio: "inherit" });
  }

  if (!existsSync(cliPath)) {
    throw new Error(`Sniffler CLI not found: ${cliPath}. Run pnpm build first.`);
  }

  const scenarios = options.scenarios.length > 0 ? options.scenarios : loadDefaultScenarios(appRoot);

  if (scenarios.length === 0) {
    throw new Error("No scenarios available. Pass --scenario name=file[,file...]");
  }

  console.log(`App: ${appRoot}`);
  console.log(`CLI: ${relative(process.cwd(), cliPath)}`);
  console.log(`Iterations: ${options.iterations} measured, ${options.warmup} warmup\n`);

  const results = scenarios.map((scenario) => {
    console.log(`Running ${scenario.name}: ${scenario.changedFiles.join(", ")}`);
    const result = runScenario({
      cliPath,
      appRoot,
      scenario,
      iterations: options.iterations,
      warmup: options.warmup
    });

    console.log(
      [
        `  mean ${formatMs(result.mean)}`,
        `median ${formatMs(result.median)}`,
        `p95 ${formatMs(result.p95)}`,
        `min ${formatMs(result.min)}`,
        `max ${formatMs(result.max)}`,
        `affected ${result.affectedModules}`,
        `tests ${result.recommendedTests}`,
        `warnings ${result.warnings}`
      ].join(" | ")
    );

    return {
      name: scenario.name,
      ...result
    };
  });

  console.log("\nJSON summary:");
  console.log(JSON.stringify({ appRoot, iterations: options.iterations, warmup: options.warmup, results }, null, 2));
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
