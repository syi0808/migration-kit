import type { EnvironmentRequirementCheck, RuntimeRequirementOptions } from "../types.js";
import { createRuntimeCheck } from "./check-runtime.js";

function node(options?: RuntimeRequirementOptions): EnvironmentRequirementCheck {
  return createRuntimeCheck("node", "node", options);
}

export { node };
