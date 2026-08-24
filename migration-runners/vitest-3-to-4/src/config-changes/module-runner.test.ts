import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { moduleRunnerConfigChange } from "./module-runner.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("moduleRunnerConfigChange", () => {
  it("moves legacy dependency options under server.deps", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    deps: {",
      "      external: [/react/],",
      "      inline: ['pkg'],",
      "      fallbackCJS: true,",
      "      optimizer: {",
      "        web: { enabled: true },",
      "      },",
      "    },",
      "  },",
      "}",
      "",
    ]);

    const result = await moduleRunnerConfigChange.transform?.(configPath);
    const output = readFileSync(configPath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: configPath });
    expect(output).toContain("client: {");
    expect(output).toContain("server: {");
    expect(output).toContain("deps: {");
    expect(output).toContain("external: [/react/]");
    expect(output).toContain("inline: ['pkg']");
    expect(output).toContain("fallbackCJS: true");
    expect(moduleRunnerConfigChange.shouldBlock?.(configPath)).toBe(false);
  });

  it("keeps conflicting legacy dependency options blocked for review", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    deps: {",
      "      external: ['old'],",
      "    },",
      "    server: {",
      "      deps: {",
      "        external: ['new'],",
      "      },",
      "    },",
      "  },",
      "}",
      "",
    ]);

    const result = await moduleRunnerConfigChange.transform?.(configPath);

    expect(result).toEqual({ status: "unchanged", filePath: configPath });
    expect(moduleRunnerConfigChange.shouldBlock?.(configPath)).toEqual({
      reason: "deps.external/deps.inline/deps.fallbackCJS moved under server.deps.",
    });
  });
});

function createConfig(lines: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-module-runner-"));
  const configPath = join(directory, "vitest.config.ts");

  tempDirectories.push(directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(configPath, lines.join("\n"));

  return configPath;
}
