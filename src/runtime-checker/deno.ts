import type { RuntimeRequirementOptions } from "../types.js";
import { createRuntimeCheck } from "./check-runtime.js";

function deno(options?: RuntimeRequirementOptions) {
  return createRuntimeCheck("deno", "deno", options);
}

export { deno };
