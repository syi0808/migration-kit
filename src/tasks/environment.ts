import type { createLogUpdate } from "log-update";
import type { EnvironmentRequirementCheck } from "../types.js";

function environmentTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: EnvironmentRequirementCheck[],
) {}

export { environmentTask };
