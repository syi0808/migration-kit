import type { BlockCheckResult } from "../types.js";

type BlockCheck = (filePath: string) => BlockCheckResult;

type NormalizedBlockFinding =
  | { kind: "manual-fix"; reason: string }
  | { kind: "manual-confirmation"; reason: string; prompt?: string };

type BlockCheckStatus =
  | { status: "passed" }
  | { status: "blocked"; findings: NormalizedBlockFinding[] }
  | { status: "failed"; reason: string };

export type { BlockCheck, BlockCheckStatus, NormalizedBlockFinding };
