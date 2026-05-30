import type { createLogUpdate } from "log-update";
import { relative } from "node:path";
import { glob } from "tinyglobby";
import type { ApiChange, TransformResult, Transformer } from "../types.js";
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
  blocked: Array<{ filePath: string; reason: string }>;
};

type BlockCheckResult =
  | { status: "passed" }
  | { status: "blocked"; reason: string }
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
    blocked: [],
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

    if (summary.blocked.length === 0) {
      return false;
    }

    if (policy === "advisory") {
      return false;
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
      summary.blocked.push({ filePath, reason: result.reason });
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
): BlockCheckResult {
  try {
    const result = shouldBlock(filePath);

    return result ? { status: "blocked", reason: result.reason } : { status: "passed" };
  } catch (error) {
    return { status: "failed", reason: formatError(error) };
  }
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
  if (summary.blocked.length > 0) {
    logUpdate.persist(
      policy === "blocking"
        ? logStyle.error(`${summary.blocked.length} blocked`, 2)
        : logStyle.warning(
            `${summary.blocked.length} ${pluralize(summary.blocked.length, "advisory", "advisories")}`,
            2,
          ),
    );

    for (const result of summary.blocked) {
      logUpdate.persist(logStyle.detail(formatFileResult(result.filePath, result.reason), 3));
    }
  }

  if (summary.blocked.length === 0 && summary.failed.length === 0) {
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

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { apiChangesTask };
