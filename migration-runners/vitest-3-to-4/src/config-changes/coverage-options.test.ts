import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { coverageOptionsChange } from "./coverage-options.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("coverageOptionsChange", () => {
  it("removes Vitest 4 coverage options that no longer exist", async () => {
    const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-coverage-"));
    const configPath = join(directory, "vitest.config.ts");

    tempDirectories.push(directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      configPath,
      [
        "export default {",
        "  test: {",
        "    coverage: {",
        "      all: true,",
        "      extensions: ['ts'],",
        "      ignoreEmptyLines: true,",
        "      experimentalAstAwareRemapping: true,",
        "      include: ['src/**/*.ts'],",
        "    },",
        "  },",
        "}",
        "",
      ].join("\n"),
    );

    const result = await coverageOptionsChange.transform?.(configPath);
    const output = readFileSync(configPath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: configPath });
    expect(output).not.toContain("all:");
    expect(output).not.toContain("extensions:");
    expect(output).not.toContain("ignoreEmptyLines:");
    expect(output).not.toContain("experimentalAstAwareRemapping:");
    expect(output).toContain("include:");
  });
});
