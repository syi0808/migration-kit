import type { createLogUpdate } from "log-update";
import { relative } from "node:path";
import { glob } from "tinyglobby";
import type { ApiChange, TransformResult, Transformer } from "../types.js";
import { waitForCwdChange } from "../utils/watch.js";

async function apiChangesTask(logUpdate: ReturnType<typeof createLogUpdate>, checks: ApiChange[]) {
  let hasFailure = false;

  for (const check of checks) {
    logUpdate.persist(`  ${check.title}`);

    if (check.description) {
      logUpdate.persist(`    ${check.description}`);
    }

    const filePaths = await findFiles(check.files);

    if (filePaths.length === 0) {
      logUpdate.persist("    - No files matched");
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

  const level = check.level ?? "error";

  while (true) {
    const summary = await collectBlockSummary(check);

    logBlockSummary(logUpdate, summary, level);

    if (summary.failed.length > 0) {
      return true;
    }

    if (summary.blocked.length === 0) {
      return false;
    }

    if (level === "warning") {
      return false;
    }

    logUpdate.persist("      Waiting for changes under cwd...");
    await waitForCwdChange();
    logUpdate.persist("    - Rechecking after file change");
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
    logUpdate.persist(`    ✓ ${summary.updated} auto-fixed`);
  }

  if (summary.unchanged > 0) {
    logUpdate.persist(`    ✓ ${summary.unchanged} unchanged`);
  }

  if (summary.needsReview.length > 0) {
    logUpdate.persist(
      `    ! ${summary.needsReview.length} ${pluralize(summary.needsReview.length, "needs review", "need review")}`,
    );

    for (const result of summary.needsReview) {
      logUpdate.persist(`      ${formatFileResult(result.filePath, result.reason)}`);
    }
  }

  if (summary.failed.length > 0) {
    logUpdate.persist(`    ✗ ${summary.failed.length} failed`);

    for (const result of summary.failed) {
      logUpdate.persist(`      ${formatFileResult(result.filePath, result.reason)}`);
    }
  }
}

function logBlockSummary(
  logUpdate: ReturnType<typeof createLogUpdate>,
  summary: Summary,
  level: NonNullable<ApiChange["level"]>,
) {
  if (summary.blocked.length > 0) {
    logUpdate.persist(`    ${level === "error" ? "✗" : "!"} ${summary.blocked.length} blocked`);

    for (const result of summary.blocked) {
      logUpdate.persist(`      ${formatFileResult(result.filePath, result.reason)}`);
    }
  }

  if (summary.blocked.length === 0 && summary.failed.length === 0) {
    logUpdate.persist("    ✓ Not blocked");
  }

  if (summary.failed.length > 0) {
    logUpdate.persist(`    ✗ ${summary.failed.length} block check failed`);
    for (const result of summary.failed) {
      logUpdate.persist(`      ${formatFileResult(result.filePath, result.reason)}`);
    }
  }
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function formatFileResult(filePath: string, reason: string) {
  return `${relative(process.cwd(), filePath) || filePath}: ${reason}`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { apiChangesTask };
