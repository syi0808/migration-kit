type Summary = {
  updated: number;
  unchanged: number;
  needsReview: Array<{ filePath: string; reason: string }>;
  failed: Array<{ filePath: string; reason: string }>;
};

export type { Summary };
