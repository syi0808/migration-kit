import { readFileSync } from "node:fs";
import type { ConfigChange } from "migration-kit";

const browserProviderChange: ConfigChange = {
  title: "Review browser provider config",
  description:
    "Flags browser provider strings, browser.name, and providerOptions because Vitest 4 uses provider factories and browser.instances.",
  policy: "advisory",
  shouldBlock: browserProviderReviewBlocker,
};

function browserProviderReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");

  if (
    /\bbrowser\s*:\s*{[\s\S]*?\b(provider\s*:\s*['"]|name\s*:|providerOptions\s*:)/.test(source)
  ) {
    return {
      reason: "browser provider config changed; use provider factories and browser.instances.",
    };
  }

  return false;
}

export { browserProviderChange };
