import { readFileSync } from "node:fs";
import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";

const reviewSourceApiChanges: ApiChange = {
  title: "Review Vitest 4 source API changes",
  description:
    "Flags browser utility imports, removed internal APIs, custom environments, reporter APIs, restoreAllMocks, and deprecated types.",
  policy: "advisory",
  files: sourceFilePatterns,
  shouldBlock: sourceReviewBlocker,
};

function sourceReviewBlocker(filePath: string) {
  const reasons = collectSourceReviewReasons(readFileSync(filePath, "utf8"));

  if (reasons.length === 0) {
    return false;
  }

  return { reason: reasons.join(" ") };
}

function collectSourceReviewReasons(source: string): string[] {
  const reasons: string[] = [];

  addIf(
    reasons,
    source.includes("@vitest/browser/utils"),
    "Replace @vitest/browser/utils imports with utilities from vitest/browser.",
  );
  addIf(
    reasons,
    source.includes("vitest/execute"),
    "vitest/execute was removed; migrate internal runner integrations to the new module runner APIs.",
  );
  addIf(
    reasons,
    source.includes("__vitest_executor"),
    "__vitest_executor is no longer injected; use the injected moduleRunner where applicable.",
  );
  addIf(
    reasons,
    /\btransformMode\s*:/.test(source),
    "Custom Vitest environments no longer need transformMode; provide viteEnvironment when needed.",
  );
  addIf(
    reasons,
    /\bvi\.restoreAllMocks\s*\(/.test(source),
    "vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
  );
  addIf(
    reasons,
    /\b(onCollected|onSpecsCollected|onPathsCollected|onTaskUpdate|onFinished)\s*\(/.test(source),
    "Several reporter APIs were removed; migrate custom reporters to the Vitest 4 reporter API.",
  );
  addIf(
    reasons,
    /\b(SpyInstance|WorkspaceSpec)\b/.test(source),
    "Deprecated Vitest types were removed; replace them with current public types.",
  );

  return reasons;
}

function addIf(reasons: string[], condition: boolean, reason: string) {
  if (condition) {
    reasons.push(reason);
  }
}

export { collectSourceReviewReasons, reviewSourceApiChanges, sourceReviewBlocker };
