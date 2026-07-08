import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reporterUpdatesChange } from "./reporter-updates.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("reporterUpdatesChange", () => {
  it("rewrites basic reporter config", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    reporters: ['basic', ['basic', { verbose: true }], 'dot'],",
      "  },",
      "}",
      "",
    ]);

    const result = await reporterUpdatesChange.transform?.(configPath);
    const output = readFileSync(configPath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: configPath });
    expect(output).not.toContain("'basic'");
    expect(output).toContain('"default"');
    expect(output).toContain("summary: false");
    expect(output).toContain("verbose: true");
    expect(output).toContain("'dot'");
  });

  it("rewrites string basic reporter config", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    reporters: 'basic',",
      "  },",
      "}",
      "",
    ]);

    const result = await reporterUpdatesChange.transform?.(configPath);
    const output = readFileSync(configPath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: configPath });
    expect(output).toContain('"default"');
    expect(output).toContain("summary: false");
  });
});

function createConfig(lines: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-reporter-"));
  const configPath = join(directory, "vitest.config.ts");

  tempDirectories.push(directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(configPath, lines.join("\n"));

  return configPath;
}
