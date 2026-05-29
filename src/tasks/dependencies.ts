import type { createLogUpdate } from "log-update";
import type { PeerDependency } from "../types.js";

function dependenciesTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: PeerDependency[],
) {}

export { dependenciesTask };
