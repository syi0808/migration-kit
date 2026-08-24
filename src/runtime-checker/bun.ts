import type { EnvironmentRequirementCheck, RuntimeRequirementOptions } from "../types.js";
import { createRuntimeCheck } from "./check-runtime.js";

function bun(options?: RuntimeRequirementOptions): EnvironmentRequirementCheck {
  return createRuntimeCheck("bun", "bun", options);
}

export { bun };
