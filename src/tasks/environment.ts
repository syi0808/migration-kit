import type { createLogUpdate } from "log-update";
import type { EnvironmentRequirementCheck, EnvironmentRequirementResult } from "../types.js";

async function environmentTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: EnvironmentRequirementCheck[],
) {
  for (const [index, check] of checks.entries()) {
    try {
      const result = await check();
      const available = isAvailable(result);
      const message = formatCheckMessage(check, result, available, index);

      logUpdate.persist(`  ${available ? "✓" : "✗"} ${message}`);
    } catch (error) {
      const label = check.label ?? `Check ${index + 1}`;
      const message = formatError(error);

      logUpdate.persist(`  ✗ ${label}: ${message}`);
    }
  }
}

function isAvailable(result: EnvironmentRequirementResult) {
  return typeof result === "boolean" ? result : result.available;
}

function formatCheckMessage(
  check: EnvironmentRequirementCheck,
  result: EnvironmentRequirementResult,
  available: boolean,
  index: number,
) {
  if (typeof result !== "boolean" && result.message) {
    return result.message;
  }

  if (available && check.successMessage) {
    return check.successMessage;
  }

  if (!available && check.failureMessage) {
    return check.failureMessage;
  }

  return check.label ?? `Check ${index + 1}`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { environmentTask };
