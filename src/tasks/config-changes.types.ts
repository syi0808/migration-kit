import type { NormalizedBlockFinding } from "./block-check.js";

type ManualConfirmationFinding = Extract<NormalizedBlockFinding, { kind: "manual-confirmation" }>;

export type { ManualConfirmationFinding };
