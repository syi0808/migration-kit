import type { createLogUpdate } from "log-update";
import { isAbsolute, relative } from "node:path";
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
  manualConfirmations: ManualConfirmationResult[];
};

type ManualConfirmationResult = {
  filePath: string;
  reason: string;
  prompt?: string;
};

type NormalizedBlockFinding =
  | { kind: "manual-fix"; reason: string }
  | { kind: "manual-confirmation"; reason: string; prompt?: string };

type BlockCheckStatus =
  | { status: "passed" }
  | { status: "blocked"; findings: NormalizedBlockFinding[] }
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
  const confirmedManualConfirmations = new Set<string>();

  while (true) {
    const summary = await collectBlockSummary(check, confirmedManualConfirmations);

    logBlockSummary(logUpdate, summary, policy);

    if (summary.failed.length > 0) {
      return true;
    }

    if (policy === "advisory") {
      return false;
    }

    for (const confirmation of summary.manualConfirmations) {
      const confirmed = await requestManualConfirmation(
        createManualConfirmationPrompt(check.title, confirmation),
      );

      if (confirmed) {
        confirmedManualConfirmations.add(createManualConfirmationKey(confirmation));
        logUpdate.persist(logStyle.success("Confirmed", 2));
        continue;
      }

      logUpdate.persist(logStyle.error("Confirmation declined", 2));
      return true;
    }

    if (summary.manualFixes.length === 0) {
      return false;
    }

    logUpdate.persist(logStyle.info("Waiting for changes under cwd...", 3));
    await waitForCwdChange();
    logUpdate.persist(logStyle.info("Rechecking after file change", 2));
  }
}

async function collectBlockSummary(
  check: ApiChange,
  confirmedManualConfirmations: ReadonlySet<string>,
): Promise<Summary> {
  const summary = createSummary();

  if (!check.shouldBlock) {
    return summary;
  }

  const filePaths = await findFiles(check.files);

  for (const filePath of filePaths) {
    const result = runBlockCheck(check.shouldBlock, filePath);

    if (result.status === "failed") {
      summary.failed.push({ filePath, reason: `Block check failed: ${result.reason}` });
      continue;
    }

    if (result.status === "blocked") {
      for (const finding of result.findings) {
        if (finding.kind === "manual-confirmation") {
          const confirmation = {
            filePath,
            reason: finding.reason,
            ...(finding.prompt ? { prompt: finding.prompt } : {}),
          };

          if (!confirmedManualConfirmations.has(createManualConfirmationKey(confirmation))) {
            summary.manualConfirmations.push(confirmation);
          }
        } else {
          summary.manualFixes.push({ filePath, reason: finding.reason });
        }
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

function createManualConfirmationPrompt(title: string, confirmation: ManualConfirmationResult) {
  const filePath = formatPlainPath(confirmation.filePath);

  if (confirmation.prompt) {
    return `${filePath}: ${confirmation.prompt}`;
  }

  return `Confirm you manually verified "${title}" for ${formatPlainFileResult(
    confirmation.filePath,
    confirmation.reason,
  )} before continuing.`;
}

function createManualConfirmationKey(confirmation: ManualConfirmationResult) {
  return `${confirmation.filePath}\0${confirmation.reason}\0${confirmation.prompt ?? ""}`;
}

function formatPlainFileResult(filePath: string, reason: string) {
  return `${formatPlainPath(filePath)}: ${reason}`;
}

function formatPlainPath(filePath: string) {
  const relativePath = relative(process.cwd(), filePath);

  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return filePath;
  }

  return relativePath;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { apiChangesTask };
