import type { createLogUpdate } from "log-update";
import { isAbsolute, relative } from "node:path";
import type { BlockFinding, ResolvedConfigChange, TransformResult, Transformer } from "../types.js";
import { logStyle } from "../utils/log-style.js";
import {
  runBlockingSession,
  type BlockingConfirmation,
  type BlockingItem,
  type BlockingSnapshot,
} from "./blocking-session.js";

async function configChangesTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  checks: ResolvedConfigChange[],
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
  check: ResolvedConfigChange,
  configPath: string,
) {
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

type BlockCheckResult =
  | { status: "passed" }
  | { status: "blocked"; findings: NormalizedBlockFinding[] }
  | { status: "failed"; reason: string };

type ManualFixFinding = { kind: "manual-fix"; reason: string };
type ManualConfirmationFinding = {
  kind: "manual-confirmation";
  reason: string;
  prompt?: string;
};
type NormalizedBlockFinding = ManualFixFinding | ManualConfirmationFinding;

async function runTransform(transform: Transformer, filePath: string): Promise<TransformResult> {
  try {
    return await transform(filePath);
  } catch (error) {
    return { status: "failed", filePath, reason: formatError(error) };
  }
}

function runBlockCheck(
  shouldBlock: NonNullable<ResolvedConfigChange["shouldBlock"]>,
  filePath: string,
): BlockCheckResult {
  try {
    const result = shouldBlock(filePath);
    const findings = result ? normalizeBlockFindings(result) : [];

    return findings.length > 0 ? { status: "blocked", findings } : { status: "passed" };
  } catch (error) {
    return { status: "failed", reason: formatError(error) };
  }
}

function normalizeBlockFindings(finding: BlockFinding | BlockFinding[]): NormalizedBlockFinding[] {
  const findings = Array.isArray(finding) ? finding : [finding];

  return findings.map(normalizeBlockFinding);
}

function normalizeBlockFinding(finding: BlockFinding): NormalizedBlockFinding {
  if (finding.kind === "manual-confirmation") {
    return {
      kind: "manual-confirmation",
      reason: finding.reason,
      ...(finding.prompt ? { prompt: finding.prompt } : {}),
    };
  }

  return { kind: "manual-fix", reason: finding.reason };
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
) {
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

function formatPlainPath(filePath: string) {
  const relativePath = relative(process.cwd(), filePath);

  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return filePath;
  }

  return relativePath;
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
