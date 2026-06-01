import { describe, expect, it } from "vitest";
import { collectDeprecatedConfigFindings } from "./deprecated-config.js";

describe("collectDeprecatedConfigFindings", () => {
  it("marks restoreMocks behavior checks as manual confirmations", () => {
    const findings = collectDeprecatedConfigFindings(`
      export default defineConfig({
        test: {
          restoreMocks: true,
        },
      });
    `);

    expect(findings).toEqual([
      {
        kind: "manual-confirmation",
        reason:
          "restoreMocks now follows vi.restoreAllMocks behavior and no longer resets spy state.",
      },
    ]);
  });

  it("keeps removed config options as manual fixes", () => {
    const findings = collectDeprecatedConfigFindings(`
      export default defineConfig({
        test: {
          poolMatchGlobs: [],
        },
      });
    `);

    expect(findings).toEqual([
      {
        kind: "manual-fix",
        reason:
          "poolMatchGlobs/environmentMatchGlobs were removed; migrate these cases to test.projects.",
      },
    ]);
  });
});
