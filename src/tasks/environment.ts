import type { EnvironmentRequirementCheck, EnvironmentRequirementResult } from "../types.js";
import { formatError } from "../utils/error.js";
import type { MigrationRenderer } from "../utils/renderer.js";

async function environmentTask(
  renderer: MigrationRenderer,
  checks: EnvironmentRequirementCheck[],
): Promise<void> {
  for (const [index, check] of checks.entries()) {
    try {
      const result = await check();
      const available = isAvailable(result);
      const message = formatCheckMessage(check, result, available, index);
      const formattedMessage = formatResultEvidence(message, result, available);

      if (available) {
        renderer.success(formattedMessage);
      } else {
        renderer.error(formattedMessage);
      }
    } catch (error) {
      const label = check.label ?? `Check ${index + 1}`;
      const message = formatError(error);

      renderer.error(`${label}: ${message}`);
    }
  }
}

function isAvailable(result: EnvironmentRequirementResult): boolean {
  return typeof result === "boolean" ? result : result.available;
}

function formatCheckMessage(
  check: EnvironmentRequirementCheck,
  result: EnvironmentRequirementResult,
  available: boolean,
  index: number,
): string {
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

function formatResultEvidence(
  message: string,
  result: EnvironmentRequirementResult,
  available: boolean,
): string {
  if (available || typeof result === "boolean" || !result.evidence?.length) {
    return message;
  }

  return `${message} (${result.evidence.join("; ")})`;
}

export { environmentTask };
