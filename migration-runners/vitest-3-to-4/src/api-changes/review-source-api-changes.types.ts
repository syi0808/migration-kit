type SourceReviewFinding = {
  kind: "manual-fix" | "manual-confirmation";
  reason: string;
  prompt?: string;
};

export type { SourceReviewFinding };
