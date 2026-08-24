import type { BlockPolicy } from "../types.js";
import { copyToClipboard } from "../utils/clipboard.js";
import { formatError } from "../utils/error.js";
import { logStyle, stripAnsi } from "../utils/log-style.js";
import { requestManualConfirmation } from "../utils/manual-confirmation.js";
import { pluralize } from "../utils/strings.js";
import { waitForCwdChange } from "../utils/watch.js";
import type {
  BlockingConfirmation,
  BlockingItem,
  BlockingSessionOptions,
  BlockingSnapshot,
  CopyStatus,
} from "./blocking-session.types.js";

const maxPersistedDetails = 10;

/**
 * Re-runs a blocker snapshot until blocking findings are resolved, acknowledged, or failed.
 * Returns true when execution should fail, and false when the migration can continue.
 */
async function runBlockingSession({
  renderer,
  policy,
  collectSnapshot,
  copy = copyToClipboard,
  input,
}: BlockingSessionOptions): Promise<boolean> {
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
      logBlockingSummary(renderer, currentSnapshot, policy);
      return true;
    }

    if (policy === "advisory") {
      logBlockingSummary(renderer, currentSnapshot, policy);
      return false;
    }

    if (!hasBlockingItems(currentSnapshot)) {
      if (hadManualFixes && !hasLoggedManualFixesResolved) {
        renderer.success("Manual fixes resolved", 2);
        hasLoggedManualFixesResolved = true;
      }

      renderer.success(hadManualFixes || confirmedCount > 0 ? "Resolved" : "Not blocked", 2);
      return false;
    }

    if (pendingConfirmations.length > 0) {
      renderBlockingSummary(renderer, onlyConfirmations(currentSnapshot), policy);

      let confirmedThisPass: number | null;

      try {
        confirmedThisPass = await requestConfirmations(renderer, pendingConfirmations);
      } finally {
        renderer.clear();
      }

      if (confirmedThisPass === null) {
        return true;
      }

      for (const confirmation of pendingConfirmations) {
        confirmed.add(confirmation.key);
      }

      confirmedCount += confirmedThisPass;
      renderer.success(
        `${confirmedThisPass} ${pluralize(
          confirmedThisPass,
          "confirmation acknowledged",
          "confirmations acknowledged",
        )}`,
        2,
      );
      continue;
    }

    if (currentSnapshot.manualFixes.length > 0) {
      if (!hasLoggedManualFixSummary) {
        logBlockingSummary(renderer, withoutConfirmations(currentSnapshot), policy);
        hasLoggedManualFixSummary = true;
      }

      hadManualFixes = true;
      let copyStatus: CopyStatus | null = null;
      let isWaiting = true;
      const renderWatchStatus = (): void => {
        renderBlockWatchStatus(renderer, currentSnapshot.manualFixes.length, copyStatus);
      };

      renderWatchStatus();

      try {
        await waitForCwdChange({
          ...(input ? { input } : {}),
          onKeyPress: (key): void => {
            if (key !== "c" && key !== "C") {
              return;
            }

            void copyManualFixes(currentSnapshot.manualFixes, copy)
              .then((): void => {
                copyStatus = { status: "success", count: currentSnapshot.manualFixes.length };
              })
              .catch((error: unknown): void => {
                copyStatus = { status: "failure", reason: formatError(error) };
              })
              .finally((): void => {
                if (isWaiting) {
                  renderWatchStatus();
                }
              });
          },
        });
      } finally {
        isWaiting = false;
        renderer.clear();
      }
    }
  }
}

async function copyManualFixes(
  manualFixes: BlockingItem[],
  copy: (text: string) => Promise<void>,
): Promise<void> {
  await copy(formatManualFixClipboardText(manualFixes));
}

function formatManualFixClipboardText(manualFixes: BlockingItem[]): string {
  return [
    `${manualFixes.length} ${pluralize(manualFixes.length, "manual fix", "manual fixes")} remaining:`,
    ...manualFixes.map((fix) => `- ${stripAnsi(fix.detail)}`),
  ].join("\n");
}

async function requestConfirmations(
  renderer: BlockingSessionOptions["renderer"],
  confirmations: BlockingConfirmation[],
): Promise<number | null> {
  let confirmedCount = 0;

  for (const confirmation of confirmations) {
    const confirmed = await requestManualConfirmation(confirmation.prompt);

    if (!confirmed) {
      renderer.error(`Confirmation declined: ${confirmation.detail}`, 2);
      return null;
    }

    confirmedCount += 1;
  }

  return confirmedCount;
}

function logBlockingSummary(
  renderer: BlockingSessionOptions["renderer"],
  snapshot: BlockingSnapshot,
  policy: BlockPolicy,
): void {
  for (const line of formatBlockingSummary(snapshot, policy)) {
    renderer.persist(line);
  }
}

function renderBlockingSummary(
  renderer: BlockingSessionOptions["renderer"],
  snapshot: BlockingSnapshot,
  policy: BlockPolicy,
): void {
  const lines = formatBlockingSummary(snapshot, policy);

  if (lines.length === 0) {
    return;
  }

  renderer.live(lines.join("\n"));
}

function formatBlockingSummary(snapshot: BlockingSnapshot, policy: BlockPolicy): string[] {
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

function appendCappedDetails(lines: string[], items: BlockingItem[]): void {
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
  renderer: BlockingSessionOptions["renderer"],
  manualFixCount: number,
  copyStatus: CopyStatus | null,
): void {
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

  renderer.live(lines.join("\n"));
}

function hasBlockingItems(snapshot: BlockingSnapshot): boolean {
  return (
    snapshot.manualFixes.length > 0 ||
    snapshot.confirmations.length > 0 ||
    snapshot.failures.length > 0
  );
}

export { runBlockingSession };
export type { BlockingConfirmation, BlockingItem, BlockingSnapshot };
