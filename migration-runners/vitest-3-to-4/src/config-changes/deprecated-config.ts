import { readFileSync } from "node:fs";
import type { ConfigChange } from "migration-kit";

type DeprecatedConfigFinding = {
  kind: "manual-fix" | "manual-confirmation";
  reason: string;
};

const deprecatedConfigChange: ConfigChange = {
  title: "Review removed Vitest 4 config options",
  description:
    "Blocks config options and behavior changes removed in Vitest 4 that cannot be migrated safely without project context.",
  policy: "blocking",
  shouldBlock: deprecatedConfigReviewBlocker,
};

function deprecatedConfigReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const findings = collectDeprecatedConfigFindings(source);

  if (findings.length === 0) {
    return false;
  }

  const reason = findings.map((finding) => finding.reason).join(" ");

  if (findings.every((finding) => finding.kind === "manual-confirmation")) {
    return {
      kind: "manual-confirmation",
      reason,
      prompt: "Confirm Vitest 4 mock cleanup behavior was manually verified before continuing.",
    };
  }

  return { reason };
}

function collectDeprecatedConfigFindings(source: string): DeprecatedConfigFinding[] {
  const findings: DeprecatedConfigFinding[] = [];

  addManualFixIf(
    findings,
    /\b(poolMatchGlobs|environmentMatchGlobs)\s*:/.test(source),
    "poolMatchGlobs/environmentMatchGlobs were removed; migrate these cases to test.projects.",
  );
  addManualFixIf(
    findings,
    /\bbrowser\s*:\s*{[\s\S]*?\btesterScripts\s*:/.test(source),
    "browser.testerScripts was removed; use browser.testerHtmlPath.",
  );
  addManualConfirmationIf(
    findings,
    /\brestoreMocks\s*:\s*true/.test(source),
    "restoreMocks now follows vi.restoreAllMocks behavior and no longer resets spy state.",
  );

  return findings;
}

function addManualFixIf(findings: DeprecatedConfigFinding[], condition: boolean, reason: string) {
  if (condition) {
    findings.push({ kind: "manual-fix", reason });
  }
}

function addManualConfirmationIf(
  findings: DeprecatedConfigFinding[],
  condition: boolean,
  reason: string,
) {
  if (condition) {
    findings.push({ kind: "manual-confirmation", reason });
  }
}

export { collectDeprecatedConfigFindings, deprecatedConfigChange };
