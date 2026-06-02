import type { BlockCheckResult, BlockFinding } from "../types.js";
import { formatError } from "../utils/error.js";

type BlockCheck = (filePath: string) => BlockCheckResult;

type NormalizedBlockFinding =
  | { kind: "manual-fix"; reason: string }
  | { kind: "manual-confirmation"; reason: string; prompt?: string };

type BlockCheckStatus =
  | { status: "passed" }
  | { status: "blocked"; findings: NormalizedBlockFinding[] }
  | { status: "failed"; reason: string };

function runBlockCheck(shouldBlock: BlockCheck, filePath: string): BlockCheckStatus {
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

export { runBlockCheck };
export type { BlockCheckStatus, NormalizedBlockFinding };
