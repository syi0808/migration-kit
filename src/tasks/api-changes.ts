import type { createLogUpdate } from "log-update";
import { isAbsolute, relative } from "node:path";
import { glob } from "tinyglobby";
import type { ApiChange, BlockFinding, TransformResult, Transformer } from "../types.js";
import { logStyle } from "../utils/log-style.js";
import { createProgressTui } from "../utils/progress.js";
import {
  runBlockingSession,
  type BlockingConfirmation,
  type BlockingItem,
  type BlockingSnapshot,
} from "./blocking-session.js";

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
      const progress = createProgressTui(logUpdate, {
        label: "Running transforms",
        total: filePaths.length,
      });

      progress.render(0, formatProgressPath(filePaths[0]), { force: true });

      try {
        for (const [index, filePath] of filePaths.entries()) {
          progress.render(index, formatProgressPath(filePath));
          const result = await runTransform(check.transform, filePath);

          recordTransformResult(summary, result);

          if (result.status === "failed") {
            hasFailure = true;
          }

          progress.render(index + 1, formatProgressPath(filePath));
        }
      } finally {
        progress.clear();
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

  return runBlockingSession({
    logUpdate,
    policy,
    collectSnapshot: () => collectBlockSummary(logUpdate, check),
  });
}

async function collectBlockSummary(
  logUpdate: ReturnType<typeof createLogUpdate>,
  check: ApiChange,
): Promise<BlockingSnapshot> {
  const snapshot: BlockingSnapshot = {
    manualFixes: [],
    confirmations: [],
    failures: [],
  };

  if (!check.shouldBlock) {
    return snapshot;
  }

  const filePaths = await findFiles(check.files);
  const progress = createProgressTui(logUpdate, {
    label: "Checking blockers",
    total: filePaths.length,
  });

  progress.render(0, formatProgressPath(filePaths[0]), { force: true });

  try {
    for (const [index, filePath] of filePaths.entries()) {
      progress.render(index, formatProgressPath(filePath));
      const result = runBlockCheck(check.shouldBlock, filePath);

      if (result.status === "failed") {
        snapshot.failures.push({
          key: `failed:${filePath}\0${result.reason}`,
          detail: formatFileResult(filePath, result.reason),
        });
        progress.render(index + 1, formatProgressPath(filePath));
        continue;
      }

      if (result.status === "blocked") {
        for (const finding of result.findings) {
          if (finding.kind === "manual-confirmation") {
            snapshot.confirmations.push(createManualConfirmation(check.title, filePath, finding));
          } else {
            snapshot.manualFixes.push(createManualFix(filePath, finding.reason));
          }
        }
      }

      progress.render(index + 1, formatProgressPath(filePath));
    }
  } finally {
    progress.clear();
  }

  return snapshot;
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

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function createManualFix(filePath: string, reason: string): BlockingItem {
  return {
    key: `fix:${filePath}\0${reason}`,
    detail: formatFileResult(filePath, reason),
  };
}

function createManualConfirmation(
  title: string,
  filePath: string,
  finding: Extract<NormalizedBlockFinding, { kind: "manual-confirmation" }>,
): BlockingConfirmation {
  return {
    key: `${filePath}\0${finding.reason}\0${finding.prompt ?? ""}`,
    detail: formatFileResult(filePath, finding.reason),
    prompt: createManualConfirmationPrompt(title, filePath, finding),
  };
}

function formatFileResult(filePath: string, reason: string) {
  return `${logStyle.path(relative(process.cwd(), filePath) || filePath)}: ${reason}`;
}

function createManualConfirmationPrompt(
  title: string,
  filePath: string,
  confirmation: Extract<NormalizedBlockFinding, { kind: "manual-confirmation" }>,
) {
  const formattedFilePath = formatPlainPath(filePath);

  if (confirmation.prompt) {
    return `${formattedFilePath}: ${confirmation.prompt}`;
  }

  return `Confirm you manually verified "${title}" for ${formatPlainFileResult(
    filePath,
    confirmation.reason,
  )} before continuing.`;
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

function formatProgressPath(filePath: string | undefined) {
  return filePath ? formatPlainPath(filePath) : undefined;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { apiChangesTask };
