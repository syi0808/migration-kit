import type { createLogUpdate } from "log-update";
import type { ConfigChange } from "../types.js";

function configChangesTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: ConfigChange[],
  configPath: string,
) {}

export { configChangesTask };
