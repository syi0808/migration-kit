const configPaths = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.cts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.cjs",
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.cts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
];

const sourceFilePatterns = [
  "src/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
  "test/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
  "tests/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
  "__tests__/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
  "**/*.{test,spec}.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
  "vitest.setup.{js,cjs,mjs,ts,cts,mts}",
  "setupTests.{js,cjs,mjs,ts,cts,mts}",
];

const environmentVariablePatterns = [
  "package.json",
  ".env",
  ".env.*",
  ".github/**/*.{yml,yaml}",
  "scripts/**/*.{js,cjs,mjs,ts,cts,mts,sh}",
  ...configPaths,
  ...sourceFilePatterns,
];

export { configPaths, environmentVariablePatterns, sourceFilePatterns };
