import type { RuntimeRequirementOptions } from "../types.js";
import { createRuntimeCheck } from "./check-runtime.js";

function bun(options?: RuntimeRequirementOptions) {
  return createRuntimeCheck("bun", "bun", options);
}

export { bun };
