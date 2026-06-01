import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { browserProviderChange } from "./browser-provider.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("browserProviderChange", () => {
  it("moves browser.name and providerOptions into browser.instances", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    browser: {",
      "      enabled: true,",
      "      provider: playwright(),",
      "      name: 'chromium',",
      "      providerOptions: {",
      "        launch: { slowMo: 100 },",
      "      },",
      "    },",
      "  },",
      "}",
      "",
    ]);

    const result = await browserProviderChange.transform?.(configPath);
    const output = readFileSync(configPath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: configPath });
    expect(output).not.toContain("name:");
    expect(output).not.toContain("providerOptions");
    expect(output).toContain("instances: [{");
    expect(output).toContain("browser: 'chromium'");
    expect(output).toContain("launch: { slowMo: 100 }");
    expect(browserProviderChange.shouldBlock?.(configPath)).toBe(false);
  });

  it("keeps provider strings blocked after moving safe instance options", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    browser: {",
      "      provider: 'playwright',",
      "      name: 'chromium',",
      "    },",
      "  },",
      "}",
      "",
    ]);

    await browserProviderChange.transform?.(configPath);

    expect(browserProviderChange.shouldBlock?.(configPath)).toEqual({
      reason: "browser provider config changed; use provider factories and browser.instances.",
    });
  });

  it("keeps existing instances conflicts blocked for review", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    browser: {",
      "      provider: playwright(),",
      "      name: 'chromium',",
      "      instances: [{ browser: 'firefox' }],",
      "    },",
      "  },",
      "}",
      "",
    ]);

    const result = await browserProviderChange.transform?.(configPath);

    expect(result).toEqual({ status: "unchanged", filePath: configPath });
    expect(browserProviderChange.shouldBlock?.(configPath)).toEqual({
      reason: "browser provider config changed; use provider factories and browser.instances.",
    });
  });
});

function createConfig(lines: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-browser-provider-"));
  const configPath = join(directory, "vitest.config.ts");

  tempDirectories.push(directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(configPath, lines.join("\n"));

  return configPath;
}
