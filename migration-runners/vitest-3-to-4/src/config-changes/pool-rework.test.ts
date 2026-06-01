import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { poolReworkChange } from "./pool-rework.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("poolReworkChange", () => {
  it("flattens safe poolOptions and removes deleted options", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    poolOptions: {",
      "      threads: {",
      "        singleThread: true,",
      "        useAtomics: true,",
      "        useAtomic: true,",
      "      },",
      "      forks: {",
      "        execArgv: ['--inspect'],",
      "      },",
      "      vmThreads: {",
      "        memoryLimit: '256Mb',",
      "      },",
      "    },",
      "    useAtomic: true,",
      "  },",
      "}",
      "",
    ]);

    const result = await poolReworkChange.transform?.(configPath);
    const output = readFileSync(configPath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: configPath });
    expect(output).not.toContain("poolOptions");
    expect(output).not.toContain("singleThread");
    expect(output).not.toContain("useAtomics");
    expect(output).not.toContain("useAtomic");
    expect(output).toContain("maxWorkers: 1");
    expect(output).toContain("isolate: false");
    expect(output).toContain("execArgv: ['--inspect']");
    expect(output).toContain("vmMemoryLimit: '256Mb'");
    expect(poolReworkChange.shouldBlock?.(configPath)).toBe(false);
  });

  it("renames top-level worker limits and removes minWorkers", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    maxForks: 4,",
      "    minWorkers: 1,",
      "  },",
      "}",
      "",
    ]);

    const result = await poolReworkChange.transform?.(configPath);
    const output = readFileSync(configPath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: configPath });
    expect(output).toContain("maxWorkers: 4");
    expect(output).not.toContain("maxForks");
    expect(output).not.toContain("minWorkers");
    expect(poolReworkChange.shouldBlock?.(configPath)).toBe(false);
  });

  it("keeps conflicting poolOptions blocked for review", async () => {
    const configPath = createConfig([
      "export default {",
      "  test: {",
      "    poolOptions: {",
      "      threads: {",
      "        execArgv: ['--threads'],",
      "      },",
      "      forks: {",
      "        execArgv: ['--forks'],",
      "      },",
      "    },",
      "  },",
      "}",
      "",
    ]);

    await poolReworkChange.transform?.(configPath);

    expect(poolReworkChange.shouldBlock?.(configPath)).toEqual({
      reason: "poolOptions was removed; move pool options to the top level of test config.",
    });
  });
});

function createConfig(lines: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-pool-rework-"));
  const configPath = join(directory, "vitest.config.ts");

  tempDirectories.push(directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(configPath, lines.join("\n"));

  return configPath;
}
