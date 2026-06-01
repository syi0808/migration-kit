import type { createLogUpdate } from "log-update";
import { relative } from "node:path";
import { glob } from "tinyglobby";
import type { ApiChange, BlockFinding, TransformResult, Transformer } from "../types.js";
import { requestManualConfirmation } from "../utils/manual-confirmation.js";
import { logStyle } from "../utils/log-style.js";
import { waitForCwdChange } from "../utils/watch.js";

async function apiChangesTask(logUpdate: ReturnType<typeof createLogUpdate>, checks: ApiChange[]) {
  let hasFailure = false;

  for (const check of checks) {
    logUpdate.persist(logStyle.info(check.title));

    if (check.description) {
      logUpdate.persist(logStyle.detail(check.description));
    }

    const filePaths = await findFiles(check.files);

    if (filePaths.length === 0) {
      logUpdate.persist(logStyle.skipped("No files matched", 2));
      continue;
    }

    const summary = createSummary();

    if (check.transform) {
      for (const filePath of filePaths) {
        const result = await runTransform(check.transform, filePath);

        recordTransformResult(summary, result);

        if (result.status === "failed") {
          hasFailure = true;
        }
      }
    }

    logTransformSummary(logUpdate, summary);

    if (check.shouldBlock) {
      hasFailure = (await waitForApiBlockCheck(logUpdate, check)) || hasFailure;
    }
  }

  if (hasFailure) {
    throw new Error("API changes require attention.");
  }
}

type Summary = {
  updated: number;
  unchanged: number;
  needsReview: Array<{ filePath: string; reason: string }>;
  failed: Array<{ filePath: string; reason: string }>;
  manualFixes: Array<{ filePath: string; reason: string }>;
  manualConfirmations: Array<{ filePath: string; reason: string; prompt?: string }>;
};

type NormalizedBlockFinding =
  | { kind: "manual-fix"; reason: string }
  | { kind: "manual-confirmation"; reason: string; prompt?: string };

type BlockCheckStatus =
  | { status: "passed" }
  | { status: "blocked"; finding: NormalizedBlockFinding }
  | { status: "failed"; reason: string };

async function findFiles(patterns: string[]) {
  const filePaths = await glob(patterns, {
    absolute: true,
    cwd: process.cwd(),
    dot: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**"],
  });

  return filePaths.sort((left, right) => left.localeCompare(right));
}

function createSummary(): Summary {
  return {
    updated: 0,
    unchanged: 0,
    needsReview: [],
    failed: [],
    manualFixes: [],
    manualConfirmations: [],
  };
}

async function waitForApiBlockCheck(
  logUpdate: ReturnType<typeof createLogUpdate>,
  check: ApiChange,
) {
  if (!check.shouldBlock) {
    return false;
  }

  const policy = check.policy ?? "blocking";

  while (true) {
    const summary = await collectBlockSummary(check);

    logBlockSummary(logUpdate, summary, policy);

    if (summary.failed.length > 0) {
      return true;
    }

    if (policy === "advisory") {
      return false;
    }

    if (summary.manualFixes.length === 0 && summary.manualConfirmations.length === 0) {
      return false;
    }

    if (summary.manualConfirmations.length > 0 && summary.manualFixes.length === 0) {
      const confirmed = await requestManualConfirmation(
        createManualConfirmationPrompt(check.title, summary.manualConfirmations),
      );

      if (confirmed) {
        logUpdate.persist(logStyle.success("Confirmed", 2));
        return false;
      }

      logUpdate.persist(logStyle.error("Confirmation declined", 2));
      return true;
    }

    logUpdate.persist(logStyle.info("Waiting for changes under cwd...", 3));
    await waitForCwdChange();
    logUpdate.persist(logStyle.info("Rechecking after file change", 2));
  }
}

async function collectBlockSummary(check: ApiChange): Promise<Summary> {
  const summary = createSummary();

  if (!check.shouldBlock) {
    return summary;
  }

  const filePaths = await findFiles(check.files);

  for (const filePath of filePaths) {
    const result = runBlockCheck(check.shouldBlock, filePath);

    if (result.status === "failed") {
      summary.failed.push({ filePath, reason: `Block check failed: ${result.reason}` });
    } else if (result.status === "blocked") {
      if (result.finding.kind === "manual-confirmation") {
        summary.manualConfirmations.push({
          filePath,
          reason: result.finding.reason,
          ...(result.finding.prompt ? { prompt: result.finding.prompt } : {}),
        });
      } else {
        summary.manualFixes.push({ filePath, reason: result.finding.reason });
      }
    }
  }

  return summary;
}

async function runTransform(transform: Transformer, filePath: string): Promise<TransformResult> {
  try {
    return await transform(filePath);
  } catch (error) {
    return { status: "failed", filePath, reason: formatError(error) };
  }
}

function runBlockCheck(
  shouldBlock: NonNullable<ApiChange["shouldBlock"]>,
  filePath: string,
): BlockCheckStatus {
  try {
    const result = shouldBlock(filePath);

    return result
      ? { status: "blocked", finding: normalizeBlockFinding(result) }
      : { status: "passed" };
  } catch (error) {
    return { status: "failed", reason: formatError(error) };
  }
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

function recordTransformResult(summary: Summary, result: TransformResult) {
  if (result.status === "updated") {
    summary.updated += 1;
    return;
  }

  if (result.status === "unchanged") {
    summary.unchanged += 1;
    return;
  }

  if (result.status === "needs-review") {
    summary.needsReview.push({ filePath: result.filePath, reason: result.reason });
    return;
  }

  summary.failed.push({ filePath: result.filePath, reason: result.reason });
}

function logTransformSummary(logUpdate: ReturnType<typeof createLogUpdate>, summary: Summary) {
  if (summary.updated > 0) {
    logUpdate.persist(logStyle.success(`${summary.updated} auto-fixed`, 2));
  }

  if (summary.unchanged > 0) {
    logUpdate.persist(logStyle.success(`${summary.unchanged} unchanged`, 2));
  }

  if (summary.needsReview.length > 0) {
    logUpdate.persist(
      logStyle.warning(
        `${summary.needsReview.length} ${pluralize(summary.needsReview.length, "needs review", "need review")}`,
        2,
      ),
    );

    for (const result of summary.needsReview) {
      logUpdate.persist(logStyle.detail(formatFileResult(result.filePath, result.reason), 3));
    }
  }

  if (summary.failed.length > 0) {
    logUpdate.persist(logStyle.error(`${summary.failed.length} failed`, 2));

    for (const result of summary.failed) {
      logUpdate.persist(logStyle.detail(formatFileResult(result.filePath, result.reason), 3));
    }
  }
}

function logBlockSummary(
  logUpdate: ReturnType<typeof createLogUpdate>,
  summary: Summary,
  policy: NonNullable<ApiChange["policy"]>,
) {
  if (summary.manualFixes.length > 0) {
    logUpdate.persist(
      policy === "blocking"
        ? logStyle.error(`${summary.manualFixes.length} blocked`, 2)
        : logStyle.warning(
            `${summary.manualFixes.length} ${pluralize(summary.manualFixes.length, "advisory", "advisories")}`,
            2,
          ),
    );

    for (const result of summary.manualFixes) {
      logUpdate.persist(logStyle.detail(formatFileResult(result.filePath, result.reason), 3));
    }
  }

  if (summary.manualConfirmations.length > 0) {
    logUpdate.persist(
      logStyle.warning(
        policy === "blocking"
          ? `${summary.manualConfirmations.length} ${pluralize(
              summary.manualConfirmations.length,
              "needs confirmation",
              "need confirmation",
            )}`
          : `${summary.manualConfirmations.length} ${pluralize(
              summary.manualConfirmations.length,
              "confirmation advisory",
              "confirmation advisories",
            )}`,
        2,
      ),
    );

    for (const result of summary.manualConfirmations) {
      logUpdate.persist(logStyle.detail(formatFileResult(result.filePath, result.reason), 3));
    }
  }

  if (
    summary.manualFixes.length === 0 &&
    summary.manualConfirmations.length === 0 &&
    summary.failed.length === 0
  ) {
    logUpdate.persist(logStyle.success(policy === "blocking" ? "Not blocked" : "No advisories", 2));
  }

  if (summary.failed.length > 0) {
    logUpdate.persist(logStyle.error(`${summary.failed.length} block check failed`, 2));
    for (const result of summary.failed) {
      logUpdate.persist(logStyle.detail(formatFileResult(result.filePath, result.reason), 3));
    }
  }
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function formatFileResult(filePath: string, reason: string) {
  return `${logStyle.path(relative(process.cwd(), filePath) || filePath)}: ${reason}`;
}

function createManualConfirmationPrompt(
  title: string,
  confirmations: Array<{ filePath: string; reason: string; prompt?: string }>,
) {
  if (confirmations.length === 1 && confirmations[0]?.prompt) {
    return confirmations[0].prompt;
  }

  return `Confirm you manually verified "${title}" findings before continuing.`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { apiChangesTask };
