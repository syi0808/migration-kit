import type { createLogUpdate } from "log-update";
import type { ConfigChange, TransformResult, Transformer } from "../types.js";
import { logStyle } from "../utils/log-style.js";
import { waitForCwdChange } from "../utils/watch.js";

async function configChangesTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: ConfigChange[],
  configPath: string,
) {
  let hasFailure = false;

  for (const check of checks) {
    logUpdate.persist(logStyle.info(check.title));

    if (check.description) {
      logUpdate.persist(logStyle.detail(check.description));
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
      logUpdate.persist(logStyle.error("Block check failed", 2));
      logUpdate.persist(logStyle.detail(result.reason, 3));
      return true;
    }

    if (result.status === "passed") {
      logUpdate.persist(logStyle.success("Not blocked", 2));
      return false;
    }

    const failed = check.level === "error";

    logUpdate.persist(failed ? logStyle.error("Blocked", 2) : logStyle.warning("Blocked", 2));
    logUpdate.persist(logStyle.detail(result.reason, 3));

    if (!failed) {
      return false;
    }

    logUpdate.persist(logStyle.info("Waiting for changes under cwd...", 3));
    await waitForCwdChange();
    logUpdate.persist(logStyle.info("Rechecking after file change", 2));
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
    logUpdate.persist(logStyle.success("Updated", 2));
    return;
  }

  if (result.status === "unchanged") {
    logUpdate.persist(logStyle.success("Unchanged", 2));
    return;
  }

  if (result.status === "needs-review") {
    logUpdate.persist(logStyle.warning("Needs review", 2));
    logUpdate.persist(logStyle.detail(result.reason, 3));
    return;
  }

  logUpdate.persist(logStyle.error("Failed", 2));
  logUpdate.persist(logStyle.detail(result.reason, 3));
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { configChangesTask };
