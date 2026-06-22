import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/.benchmark-repos/**"]
  },
  benchmark: {
    include: ["tests/**/*.bench.ts"],
    exclude: [...configDefaults.exclude, "**/.benchmark-repos/**"]
  }
});
