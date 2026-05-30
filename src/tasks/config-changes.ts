import type { createLogUpdate } from "log-update";
import type { ConfigChange, TransformResult, Transformer } from "../types.js";
import { waitForCwdChange } from "../utils/watch.js";

async function configChangesTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: ConfigChange[],
  configPath: string,
) {
  let hasFailure = false;

  for (const check of checks) {
    logUpdate.persist(`  ${check.title}`);

    if (check.description) {
      logUpdate.persist(`    ${check.description}`);
    }

    if (check.transform) {
      const result = await runTransform(check.transform, configPath);

      logTransformResult(logUpdate, result);

      if (result.status === "failed") {
        hasFailure = true;
      }
    }

    if (check.shouldBlock) {
      hasFailure = (await waitForConfigBlockCheck(logUpdate, check, configPath)) || hasFailure;
    }
  }

  if (hasFailure) {
    throw new Error("Config changes require attention.");
  }
}

async function waitForConfigBlockCheck(
  logUpdate: ReturnType<typeof createLogUpdate>,
  check: ConfigChange,
  configPath: string,
) {
  if (!check.shouldBlock) {
    return false;
  }

  while (true) {
    const result = runBlockCheck(check.shouldBlock, configPath);

    if (result.status === "failed") {
      logUpdate.persist("    ✗ Block check failed");
      logUpdate.persist(`      ${result.reason}`);
      return true;
    }

    if (result.status === "passed") {
      logUpdate.persist("    ✓ Not blocked");
      return false;
    }

    const failed = check.level === "error";

    logUpdate.persist(`    ${failed ? "✗" : "!"} Blocked`);
    logUpdate.persist(`      ${result.reason}`);

    if (!failed) {
      return false;
    }

    logUpdate.persist("      Waiting for changes under cwd...");
    await waitForCwdChange();
    logUpdate.persist("    - Rechecking after file change");
  }
}

type BlockCheckResult =
  | { status: "passed" }
  | { status: "blocked"; reason: string }
  | { status: "failed"; reason: string };

async function runTransform(transform: Transformer, filePath: string): Promise<TransformResult> {
  try {
    return await transform(filePath);
  } catch (error) {
    return { status: "failed", filePath, reason: formatError(error) };
  }
}

function runBlockCheck(
  shouldBlock: NonNullable<ConfigChange["shouldBlock"]>,
  filePath: string,
): BlockCheckResult {
  try {
    const result = shouldBlock(filePath);

    return result ? { status: "blocked", reason: result.reason } : { status: "passed" };
  } catch (error) {
    return { status: "failed", reason: formatError(error) };
  }
}

function logTransformResult(
  logUpdate: ReturnType<typeof createLogUpdate>,
  result: TransformResult,
) {
  if (result.status === "updated") {
    logUpdate.persist("    ✓ Updated");
    return;
  }

  if (result.status === "unchanged") {
    logUpdate.persist("    ✓ Unchanged");
    return;
  }

  if (result.status === "needs-review") {
    logUpdate.persist("    ! Needs review");
    logUpdate.persist(`      ${result.reason}`);
    return;
  }

  logUpdate.persist("    ✗ Failed");
  logUpdate.persist(`      ${result.reason}`);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { configChangesTask };
