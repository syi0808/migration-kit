import type { EnvironmentRequirementCheck, RuntimeRequirementOptions } from "../types.js";
import { createRuntimeCheck } from "./check-runtime.js";

function deno(options?: RuntimeRequirementOptions): EnvironmentRequirementCheck {
  return createRuntimeCheck("deno", "deno", options);
}

export { deno };
