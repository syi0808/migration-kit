import type { createLogUpdate } from "log-update";
import type { BlockPolicy } from "../types.js";
import { copyToClipboard } from "../utils/clipboard.js";
import { formatError } from "../utils/error.js";
import { logStyle, stripAnsi } from "../utils/log-style.js";
import { requestManualConfirmation } from "../utils/manual-confirmation.js";
import { pluralize } from "../utils/strings.js";
import { waitForCwdChange, type KeyInputStream } from "../utils/watch.js";

const maxPersistedDetails = 10;

type LogUpdate = ReturnType<typeof createLogUpdate>;

type BlockingItem = {
  key: string;
  detail: string;
};

type BlockingConfirmation = BlockingItem & {
  prompt: string;
};

type BlockingSnapshot = {
  manualFixes: BlockingItem[];
  confirmations: BlockingConfirmation[];
  failures: BlockingItem[];
};

type BlockingSessionOptions = {
  logUpdate: LogUpdate;
  policy: BlockPolicy;
  collectSnapshot: () => BlockingSnapshot | Promise<BlockingSnapshot>;
  copy?: (text: string) => Promise<void>;
  input?: KeyInputStream;
};

async function runBlockingSession({
  logUpdate,
  policy,
  collectSnapshot,
  copy = copyToClipboard,
  input,
}: BlockingSessionOptions) {
  const confirmed = new Set<string>();
  let hasLoggedManualFixSummary = false;
  let hadManualFixes = false;
  let hasLoggedManualFixesResolved = false;
  let confirmedCount = 0;

  while (true) {
    const snapshot = await collectSnapshot();
    const pendingConfirmations = snapshot.confirmations.filter(
      (confirmation) => !confirmed.has(confirmation.key),
    );
    const currentSnapshot = {
      manualFixes: snapshot.manualFixes,
      confirmations: pendingConfirmations,
      failures: snapshot.failures,
    };

    if (currentSnapshot.failures.length > 0) {
      logBlockingSummary(logUpdate, currentSnapshot, policy);
      return true;
    }

    if (policy === "advisory") {
      logBlockingSummary(logUpdate, currentSnapshot, policy);
      return false;
    }

    if (!hasBlockingItems(currentSnapshot)) {
      if (hadManualFixes && !hasLoggedManualFixesResolved) {
        logUpdate.persist(logStyle.success("Manual fixes resolved", 2));
        hasLoggedManualFixesResolved = true;
      }

      logUpdate.persist(
        logStyle.success(hadManualFixes || confirmedCount > 0 ? "Resolved" : "Not blocked", 2),
      );
      return false;
    }

    if (pendingConfirmations.length > 0) {
      renderBlockingSummary(logUpdate, onlyConfirmations(currentSnapshot), policy);

      let confirmedThisPass: number | null;

      try {
        confirmedThisPass = await requestConfirmations(logUpdate, pendingConfirmations);
      } finally {
        logUpdate.clear();
      }

      if (confirmedThisPass === null) {
        return true;
      }

      for (const confirmation of pendingConfirmations) {
        confirmed.add(confirmation.key);
      }

      confirmedCount += confirmedThisPass;
      logUpdate.persist(
        logStyle.success(
          `${confirmedThisPass} ${pluralize(
            confirmedThisPass,
            "confirmation acknowledged",
            "confirmations acknowledged",
          )}`,
          2,
        ),
      );
      continue;
    }

    if (currentSnapshot.manualFixes.length > 0) {
      if (!hasLoggedManualFixSummary) {
        logBlockingSummary(logUpdate, withoutConfirmations(currentSnapshot), policy);
        hasLoggedManualFixSummary = true;
      }

      hadManualFixes = true;
      let copyStatus: CopyStatus | null = null;
      let isWaiting = true;
      const renderWatchStatus = () => {
        renderBlockWatchStatus(logUpdate, currentSnapshot.manualFixes.length, copyStatus);
      };

      renderWatchStatus();

      try {
        await waitForCwdChange({
          ...(input ? { input } : {}),
          onKeyPress: (key) => {
            if (key !== "c" && key !== "C") {
              return;
            }

            void copyManualFixes(currentSnapshot.manualFixes, copy)
              .then(() => {
                copyStatus = { status: "success", count: currentSnapshot.manualFixes.length };
              })
              .catch((error: unknown) => {
                copyStatus = { status: "failure", reason: formatError(error) };
              })
              .finally(() => {
                if (isWaiting) {
                  renderWatchStatus();
                }
              });
          },
        });
      } finally {
        isWaiting = false;
        logUpdate.clear();
      }
    }
  }
}

type CopyStatus = { status: "success"; count: number } | { status: "failure"; reason: string };

async function copyManualFixes(manualFixes: BlockingItem[], copy: (text: string) => Promise<void>) {
  await copy(formatManualFixClipboardText(manualFixes));
}

function formatManualFixClipboardText(manualFixes: BlockingItem[]) {
  return [
    `${manualFixes.length} ${pluralize(manualFixes.length, "manual fix", "manual fixes")} remaining:`,
    ...manualFixes.map((fix) => `- ${stripAnsi(fix.detail)}`),
  ].join("\n");
}

async function requestConfirmations(logUpdate: LogUpdate, confirmations: BlockingConfirmation[]) {
  let confirmedCount = 0;

  for (const confirmation of confirmations) {
    const confirmed = await requestManualConfirmation(confirmation.prompt);

    if (!confirmed) {
      logUpdate.persist(logStyle.error(`Confirmation declined: ${confirmation.detail}`, 2));
      return null;
    }

    confirmedCount += 1;
  }

  return confirmedCount;
}

function logBlockingSummary(logUpdate: LogUpdate, snapshot: BlockingSnapshot, policy: BlockPolicy) {
  for (const line of formatBlockingSummary(snapshot, policy)) {
    logUpdate.persist(line);
  }
}

function renderBlockingSummary(
  logUpdate: LogUpdate,
  snapshot: BlockingSnapshot,
  policy: BlockPolicy,
) {
  const lines = formatBlockingSummary(snapshot, policy);

  if (lines.length === 0) {
    return;
  }

  logUpdate(lines.join("\n"));
}

function formatBlockingSummary(snapshot: BlockingSnapshot, policy: BlockPolicy) {
  const lines: string[] = [];

  if (snapshot.manualFixes.length > 0) {
    lines.push(
      policy === "blocking"
        ? logStyle.error(
            `${snapshot.manualFixes.length} ${pluralize(
              snapshot.manualFixes.length,
              "manual fix required",
              "manual fixes required",
            )}`,
            2,
          )
        : logStyle.warning(
            `${snapshot.manualFixes.length} ${pluralize(
              snapshot.manualFixes.length,
              "advisory",
              "advisories",
            )}`,
            2,
          ),
    );
    appendCappedDetails(lines, snapshot.manualFixes);
  }

  if (snapshot.confirmations.length > 0) {
    lines.push(
      logStyle.warning(
        policy === "blocking"
          ? `${snapshot.confirmations.length} ${pluralize(
              snapshot.confirmations.length,
              "confirmation required",
              "confirmations required",
            )}`
          : `${snapshot.confirmations.length} ${pluralize(
              snapshot.confirmations.length,
              "confirmation advisory",
              "confirmation advisories",
            )}`,
        2,
      ),
    );
    appendCappedDetails(lines, snapshot.confirmations);
  }

  if (snapshot.failures.length > 0) {
    lines.push(
      logStyle.error(
        `${snapshot.failures.length} ${pluralize(
          snapshot.failures.length,
          "block check failed",
          "block checks failed",
        )}`,
        2,
      ),
    );
    appendCappedDetails(lines, snapshot.failures);
  }

  if (!hasBlockingItems(snapshot)) {
    lines.push(logStyle.success(policy === "blocking" ? "Not blocked" : "No advisories", 2));
  }

  return lines;
}

function appendCappedDetails(lines: string[], items: BlockingItem[]) {
  for (const item of items.slice(0, maxPersistedDetails)) {
    lines.push(logStyle.detail(item.detail, 3));
  }

  const hiddenCount = items.length - maxPersistedDetails;

  if (hiddenCount > 0) {
    lines.push(
      logStyle.detail(
        `... ${hiddenCount} more ${pluralize(hiddenCount, "item", "items")} hidden`,
        3,
      ),
    );
  }
}

function withoutConfirmations(snapshot: BlockingSnapshot): BlockingSnapshot {
  return {
    manualFixes: snapshot.manualFixes,
    confirmations: [],
    failures: snapshot.failures,
  };
}

function onlyConfirmations(snapshot: BlockingSnapshot): BlockingSnapshot {
  return {
    manualFixes: [],
    confirmations: snapshot.confirmations,
    failures: [],
  };
}

function renderBlockWatchStatus(
  logUpdate: LogUpdate,
  manualFixCount: number,
  copyStatus: CopyStatus | null,
) {
  const lines = [
    logStyle.info(
      `Watching for project changes (${manualFixCount} ${pluralize(
        manualFixCount,
        "manual fix",
        "manual fixes",
      )} remaining). Press c to copy fixes.`,
      2,
    ),
  ];

  if (copyStatus?.status === "success") {
    lines.push(
      logStyle.success(
        `Copied ${copyStatus.count} ${pluralize(copyStatus.count, "fix", "fixes")} to clipboard.`,
        2,
      ),
    );
  }

  if (copyStatus?.status === "failure") {
    lines.push(logStyle.warning(`Clipboard copy failed: ${copyStatus.reason}`, 2));
  }

  logUpdate(lines.join("\n"));
}

function hasBlockingItems(snapshot: BlockingSnapshot) {
  return (
    snapshot.manualFixes.length > 0 ||
    snapshot.confirmations.length > 0 ||
    snapshot.failures.length > 0
  );
}

export { runBlockingSession };
export type { BlockingConfirmation, BlockingItem, BlockingSnapshot };
