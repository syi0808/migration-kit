import type { createLogUpdate } from "log-update";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stripAnsi } from "../utils/log-style.js";
import { configChangesTask } from "./config-changes.js";

const originalCwd = process.cwd();
const tempDirectories: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("configChangesTask", () => {
  it("logs updated transforms and passing block checks", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const configPath = "/project/vitest.config.ts";

    await configChangesTask(
      logUpdate,
      [
        {
          title: "Remove old coverage option",
          description: "coverage.all has been removed",
          policy: "blocking",
          transform: (filePath) => ({ status: "updated", filePath }),
          shouldBlock: () => false,
        },
      ],
      configPath,
    );

    expect(messages).toEqual([
      "  → Remove old coverage option",
      "    coverage.all has been removed",
      "    ✓ Updated",
      "    ✓ Not blocked",
    ]);
  });

  it("rechecks blocking-policy blockers after cwd file changes", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "vitest.config.ts": "coverage.all = true" });

    process.chdir(cwd);
    const configPath = join(process.cwd(), "vitest.config.ts");

    setTimeout(() => {
      writeFileSync(configPath, "coverage.include = ['src/**']");
    }, 50);

    await configChangesTask(
      logUpdate,
      [
        {
          title: "Remove old coverage option",
          policy: "blocking",
          shouldBlock: () => {
            if (!readFileSync(configPath, "utf8").includes("coverage.all")) {
              return false;
            }

            return { reason: "Replace coverage.all with coverage.include" };
          },
        },
      ],
      configPath,
    );

    expect(messages).toEqual([
      "  → Remove old coverage option",
      "    ✗ Blocked",
      "      Replace coverage.all with coverage.include",
      "      → Waiting for changes under cwd...",
      "    → Rechecking after file change",
      "    ✓ Not blocked",
    ]);
  });

  it("continues after logging advisory-policy blockers", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);

    await configChangesTask(
      logUpdate,
      [
        {
          title: "Review deprecated config option",
          policy: "advisory",
          shouldBlock: () => ({ reason: "Check whether this option still applies" }),
        },
      ],
      "/project/vitest.config.ts",
    );

    expect(messages).toEqual([
      "  → Review deprecated config option",
      "    ! Advisory",
      "      Check whether this option still applies",
    ]);
  });

  it("normalizes thrown transforms to failed results", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);

    await expect(
      configChangesTask(
        logUpdate,
        [
          {
            title: "Rewrite config",
            transform: () => {
              throw new Error("transform failed");
            },
          },
        ],
        "/project/vitest.config.ts",
      ),
    ).rejects.toThrow("Config changes require attention.");

    expect(messages).toEqual(["  → Rewrite config", "    ✗ Failed", "      transform failed"]);
  });
});

function createProject(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-config-task-"));

  tempDirectories.push(directory);

  for (const [fileName, source] of Object.entries(files)) {
    const filePath = join(directory, fileName);

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source);
  }

  return directory;
}

function createTestLogUpdate(messages: string[]): ReturnType<typeof createLogUpdate> {
  return Object.assign(() => {}, {
    clear: () => {},
    done: () => {},
    persist: (...text: string[]) => {
      messages.push(stripAnsi(text.join(" ")));
    },
  });
}
