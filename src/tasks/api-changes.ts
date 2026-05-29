import type { createLogUpdate } from "log-update";
import type { ApiChange } from "../types.js";

function apiChangesTask(logUpdate: ReturnType<typeof createLogUpdate>, checks: ApiChange[]) {}

export { apiChangesTask };
