import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    reporters: ["basic", ["basic", { outputFile: "./reports/basic.txt" }], "dot"],
    workspace: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
          maxForks: 4,
          minWorkers: 1,
          useAtomic: true,
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      all: true,
      extensions: ["ts", "tsx"],
      ignoreEmptyLines: true,
      experimentalAstAwareRemapping: true,
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
    },
    deps: {
      external: [/legacy-external/],
      inline: ["legacy-inline"],
      fallbackCJS: true,
      optimizer: {
        web: {
          enabled: true,
          include: ["legacy-cjs-only"],
        },
      },
    },
    browser: {
      enabled: true,
      provider: playwright(),
      name: "chromium",
      providerOptions: {
        launch: { slowMo: 100 },
        context: { locale: "en-US" },
      },
    },
    poolOptions: {
      threads: {
        singleThread: true,
        useAtomics: true,
      },
      forks: {
        execArgv: ["--inspect=0"],
      },
      vmThreads: {
        memoryLimit: "256Mb",
      },
    },
  },
});
