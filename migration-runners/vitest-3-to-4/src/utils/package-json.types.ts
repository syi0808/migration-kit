type JsonObject = Record<string, unknown>;

type PackageRangeReviewFinding = {
  kind: "manual-fix" | "manual-confirmation";
  reason: string;
};

export type { JsonObject, PackageRangeReviewFinding };
