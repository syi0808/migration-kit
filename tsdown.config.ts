import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  deps: {
    neverBundle: ["comorph"],
  },
  format: ["esm", "cjs"],
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  clean: true,
});
