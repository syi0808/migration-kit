type PackageJsonReviewFinding = {
  kind: "manual-fix" | "manual-confirmation";
  reason: string;
};

export type { PackageJsonReviewFinding };
