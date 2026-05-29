import type { RuntimeRequirementOptions } from "../types.js";
import { createRuntimeCheck } from "./check-runtime.js";

function node(options?: RuntimeRequirementOptions) {
  return createRuntimeCheck("node", "node", options);
}

export { node };
