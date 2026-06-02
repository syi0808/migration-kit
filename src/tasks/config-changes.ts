import type { createLogUpdate } from "log-update";
import type { ResolvedConfigChange, TransformResult } from "../types.js";
import { logStyle } from "../utils/log-style.js";
import { formatPlainPath } from "../utils/path-format.js";
import { runBlockCheck, type NormalizedBlockFinding } from "./block-check.js";
import {
  runBlockingSession,
  type BlockingConfirmation,
  type BlockingItem,
  type BlockingSnapshot,
} from "./blocking-session.js";
import type { ManualConfirmationFinding } from "./config-changes.types.js";
import { runTransform } from "./transform.js";

async function configChangesTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: ResolvedConfigChange[],
  configPath: string,
): Promise<void> {
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
  check: ResolvedConfigChange,
  configPath: string,
): Promise<boolean> {
  if (!check.shouldBlock) {
    return false;
  }

  return runBlockingSession({
    logUpdate,
    policy: check.policy,
    collectSnapshot: () => collectBlockSummary(check, configPath),
  });
}

function collectBlockSummary(check: ResolvedConfigChange, configPath: string): BlockingSnapshot {
  const snapshot: BlockingSnapshot = {
    manualFixes: [],
    confirmations: [],
    failures: [],
  };

  if (!check.shouldBlock) {
    return snapshot;
  }

  const result = runBlockCheck(check.shouldBlock, configPath);

  if (result.status === "failed") {
    snapshot.failures.push({
      key: `failed:${configPath}\0${result.reason}`,
      detail: result.reason,
    });
    return snapshot;
  }

  if (result.status !== "blocked") {
    return snapshot;
  }

  for (const finding of result.findings) {
    if (isManualConfirmationFinding(finding)) {
      snapshot.confirmations.push(createManualConfirmation(check.title, configPath, finding));
      continue;
    }

    snapshot.manualFixes.push(createManualFix(finding.reason));
  }

  return snapshot;
}

function isManualConfirmationFinding(
  finding: NormalizedBlockFinding,
): finding is ManualConfirmationFinding {
  return finding.kind === "manual-confirmation";
}

function createManualConfirmationPrompt(
  title: string,
  configPath: string,
  confirmation: ManualConfirmationFinding,
): string {
  const filePath = formatPlainPath(configPath);

  if (confirmation.prompt) {
    return `${filePath}: ${confirmation.prompt}`;
  }

  return `${filePath}: Confirm you manually verified "${title}" before continuing.`;
}

function createManualFix(reason: string): BlockingItem {
  return {
    key: `fix:${reason}`,
    detail: reason,
  };
}

function createManualConfirmation(
  title: string,
  configPath: string,
  confirmation: ManualConfirmationFinding,
): BlockingConfirmation {
  return {
    key: `${confirmation.reason}\0${confirmation.prompt ?? ""}`,
    detail: confirmation.reason,
    prompt: createManualConfirmationPrompt(title, configPath, confirmation),
  };
}

function logTransformResult(
  logUpdate: ReturnType<typeof createLogUpdate>,
  result: TransformResult,
): void {
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

export { configChangesTask };
