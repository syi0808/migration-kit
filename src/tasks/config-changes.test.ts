import type { createLogUpdate } from "log-update";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestManualConfirmation } from "../utils/manual-confirmation.js";
import { stripAnsi } from "../utils/log-style.js";
import { configChangesTask } from "./config-changes.js";

vi.mock("../utils/manual-confirmation.js", () => ({
  requestManualConfirmation: vi.fn(),
}));

const originalCwd = process.cwd();
const tempDirectories: string[] = [];
const requestManualConfirmationMock = vi.mocked(requestManualConfirmation);

afterEach(() => {
  process.chdir(originalCwd);
  vi.clearAllMocks();

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
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
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
      "    ✗ 1 manual fix required",
      "      Replace coverage.all with coverage.include",
      "    ✓ Manual fixes resolved",
      "    ✓ Resolved",
    ]);
    expect(liveMessages).toEqual(["    → Watching for project changes (1 manual fix remaining)."]);
  });

  it("prompts for manual-confirmation blockers instead of waiting for file changes", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);

    requestManualConfirmationMock.mockResolvedValueOnce(true);

    await configChangesTask(
      logUpdate,
      [
        {
          title: "Verify restoreMocks cleanup",
          policy: "blocking",
          shouldBlock: () => ({
            kind: "manual-confirmation",
            reason:
              "restoreMocks now follows vi.restoreAllMocks behavior and no longer resets spy state.",
            prompt: "Confirm restoreMocks cleanup expectations were reviewed.",
          }),
        },
      ],
      "/project/vitest.config.ts",
    );

    expect(requestManualConfirmationMock).toHaveBeenCalledWith(
      "/project/vitest.config.ts: Confirm restoreMocks cleanup expectations were reviewed.",
    );
    expect(messages).toEqual([
      "  → Verify restoreMocks cleanup",
      "    ✓ 1 confirmation acknowledged",
      "    ✓ Resolved",
    ]);
    expect(liveMessages).toEqual([
      "    ! 1 confirmation required\n      restoreMocks now follows vi.restoreAllMocks behavior and no longer resets spy state.",
    ]);
  });

  it("prompts manual-confirmation blockers before watching remaining manual fixes", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
    const cwd = createProject({ "vitest.config.ts": "coverage.all = true; restoreMocks: true" });

    process.chdir(cwd);
    const configPath = join(process.cwd(), "vitest.config.ts");

    requestManualConfirmationMock.mockImplementationOnce(async () => {
      expect(readFileSync(configPath, "utf8")).toBe("coverage.all = true; restoreMocks: true");
      return true;
    });

    setTimeout(() => {
      writeFileSync(configPath, "coverage.include = ['src/**']; restoreMocks: true");
    }, 50);

    await configChangesTask(
      logUpdate,
      [
        {
          title: "Review mixed config findings",
          policy: "blocking",
          shouldBlock: () => {
            const source = readFileSync(configPath, "utf8");
            const findings = [];

            if (source.includes("coverage.all")) {
              findings.push({
                kind: "manual-fix" as const,
                reason: "Replace coverage.all with coverage.include",
              });
            }

            if (source.includes("restoreMocks")) {
              findings.push({
                kind: "manual-confirmation" as const,
                reason: "Verify restoreMocks cleanup expectations.",
                prompt: "Confirm restoreMocks cleanup expectations were reviewed.",
              });
            }

            return findings.length > 0 ? findings : false;
          },
        },
      ],
      configPath,
    );

    expect(requestManualConfirmationMock).toHaveBeenCalledTimes(1);
    expect(requestManualConfirmationMock).toHaveBeenCalledWith(
      "vitest.config.ts: Confirm restoreMocks cleanup expectations were reviewed.",
    );
    expect(messages).toEqual([
      "  → Review mixed config findings",
      "    ✓ 1 confirmation acknowledged",
      "    ✗ 1 manual fix required",
      "      Replace coverage.all with coverage.include",
      "    ✓ Manual fixes resolved",
      "    ✓ Resolved",
    ]);
    expect(liveMessages).toEqual([
      "    ! 1 confirmation required\n      Verify restoreMocks cleanup expectations.",
      "    → Watching for project changes (1 manual fix remaining).",
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
      "    ! 1 advisory",
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

function createTestLogUpdate(
  messages: string[],
  liveMessages: string[] = [],
): ReturnType<typeof createLogUpdate> {
  return Object.assign(
    (...text: string[]) => {
      liveMessages.push(stripAnsi(text.join(" ")));
    },
    {
      clear: () => {},
      done: () => {},
      persist: (...text: string[]) => {
        messages.push(stripAnsi(text.join(" ")));
      },
    },
  );
}
