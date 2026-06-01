import type { createLogUpdate } from "log-update";
import { isAbsolute, relative } from "node:path";
import type { BlockFinding, ConfigChange, TransformResult, Transformer } from "../types.js";
import { logStyle } from "../utils/log-style.js";
import { requestManualConfirmation } from "../utils/manual-confirmation.js";
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

  const policy = check.policy ?? "blocking";
  const confirmedManualConfirmations = new Set<string>();

  while (true) {
    const result = runBlockCheck(check.shouldBlock, configPath);

    if (result.status === "failed") {
      logUpdate.persist(logStyle.error("Block check failed", 2));
      logUpdate.persist(logStyle.detail(result.reason, 3));
      return true;
    }

    if (result.status === "passed") {
      logUpdate.persist(
        logStyle.success(policy === "blocking" ? "Not blocked" : "No advisories", 2),
      );
      return false;
    }

    const manualFixes = result.findings.filter(isManualFixFinding);
    const manualConfirmations = result.findings
      .filter(isManualConfirmationFinding)
      .filter((finding) => !confirmedManualConfirmations.has(createManualConfirmationKey(finding)));
    const blocked = policy === "blocking";

    logBlockFindings(logUpdate, manualFixes, manualConfirmations, blocked);

    if (!blocked) {
      return false;
    }

    for (const confirmation of manualConfirmations) {
      const confirmed = await requestManualConfirmation(
        createManualConfirmationPrompt(check.title, configPath, confirmation),
      );

      if (confirmed) {
        confirmedManualConfirmations.add(createManualConfirmationKey(confirmation));
        logUpdate.persist(logStyle.success("Confirmed", 2));
        continue;
      }

      logUpdate.persist(logStyle.error("Confirmation declined", 2));
      return true;
    }

    if (manualFixes.length === 0) {
      if (manualConfirmations.length === 0) {
        logUpdate.persist(
          logStyle.success(policy === "blocking" ? "Not blocked" : "No advisories", 2),
        );
      }

      return false;
    }

    logUpdate.persist(logStyle.info("Waiting for changes under cwd...", 3));
    await waitForCwdChange();
    logUpdate.persist(logStyle.info("Rechecking after file change", 2));
  }
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
  shouldBlock: NonNullable<ConfigChange["shouldBlock"]>,
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

function isManualFixFinding(finding: NormalizedBlockFinding): finding is ManualFixFinding {
  return finding.kind === "manual-fix";
}

function isManualConfirmationFinding(
  finding: NormalizedBlockFinding,
): finding is ManualConfirmationFinding {
  return finding.kind === "manual-confirmation";
}

function logBlockFindings(
  logUpdate: ReturnType<typeof createLogUpdate>,
  manualFixes: ManualFixFinding[],
  manualConfirmations: ManualConfirmationFinding[],
  blocked: boolean,
) {
  if (manualFixes.length > 0) {
    logUpdate.persist(blocked ? logStyle.error("Blocked", 2) : logStyle.warning("Advisory", 2));

    for (const finding of manualFixes) {
      logUpdate.persist(logStyle.detail(finding.reason, 3));
    }
  }

  if (manualConfirmations.length > 0) {
    logUpdate.persist(
      logStyle.warning(blocked ? "Needs confirmation" : "Confirmation advisory", 2),
    );

    for (const finding of manualConfirmations) {
      logUpdate.persist(logStyle.detail(finding.reason, 3));
    }
  }
}

function createManualConfirmationKey(confirmation: ManualConfirmationFinding) {
  return `${confirmation.reason}\0${confirmation.prompt ?? ""}`;
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
