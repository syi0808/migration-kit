import { readFileSync } from "node:fs";
import type { ConfigChange } from "migration-kit";

const deprecatedConfigChange: ConfigChange = {
  title: "Review removed deprecated config options",
  description:
    "Flags config options removed in Vitest 4 that cannot be migrated safely without project context.",
  policy: "advisory",
  shouldBlock: deprecatedConfigReviewBlocker,
};

function deprecatedConfigReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const reasons: string[] = [];

  addIf(
    reasons,
    /\b(poolMatchGlobs|environmentMatchGlobs)\s*:/.test(source),
    "poolMatchGlobs/environmentMatchGlobs were removed; migrate these cases to test.projects.",
  );
  addIf(
    reasons,
    /\bbrowser\s*:\s*{[\s\S]*?\btesterScripts\s*:/.test(source),
    "browser.testerScripts was removed; use browser.testerHtmlPath.",
  );
  addIf(
    reasons,
    /\brestoreMocks\s*:\s*true/.test(source),
    "restoreMocks now follows vi.restoreAllMocks behavior and no longer resets spy state.",
  );

  if (reasons.length === 0) {
    return false;
  }

  return { reason: reasons.join(" ") };
}

function addIf(reasons: string[], condition: boolean, reason: string) {
  if (condition) {
    reasons.push(reason);
  }
}

export { deprecatedConfigChange };
