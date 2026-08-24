import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectDeprecatedConfigFindings,
  deprecatedConfigReviewBlocker,
} from "./deprecated-config.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
        prompt: "Confirm Vitest 4 mock cleanup behavior was manually verified before continuing.",
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

  it("returns separate manual fix and confirmation findings for mixed blockers", () => {
    const configPath = createConfig(`
      export default defineConfig({
        test: {
          poolMatchGlobs: [],
          restoreMocks: true,
        },
      });
    `);

    expect(deprecatedConfigReviewBlocker(configPath)).toEqual([
      {
        kind: "manual-fix",
        reason:
          "poolMatchGlobs/environmentMatchGlobs were removed; migrate these cases to test.projects.",
      },
      {
        kind: "manual-confirmation",
        reason:
          "restoreMocks now follows vi.restoreAllMocks behavior and no longer resets spy state.",
        prompt: "Confirm Vitest 4 mock cleanup behavior was manually verified before continuing.",
      },
    ]);
  });
});

function createConfig(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-deprecated-config-"));
  const configPath = join(directory, "vitest.config.ts");

  tempDirectories.push(directory);
  writeFileSync(configPath, source);

  return configPath;
}
