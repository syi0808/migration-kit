import type { createLogUpdate } from "log-update";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestManualConfirmation } from "../utils/manual-confirmation.js";
import { stripAnsi } from "../utils/log-style.js";
import { apiChangesTask } from "./api-changes.js";

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

describe("apiChangesTask", () => {
  it("scans matching files, runs transforms, and summarizes results", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({
      "src/a.test.ts": "a",
      "src/b.test.ts": "b",
      "src/c.ts": "c",
    });
    const transformedFiles: string[] = [];

    process.chdir(cwd);
    const projectRoot = process.cwd();

    await apiChangesTask(logUpdate, [
      {
        title: "Update mock implementation",
        files: ["src/**/*.test.ts"],
        transform: (filePath) => {
          transformedFiles.push(relative(projectRoot, filePath));

          if (filePath.endsWith("a.test.ts")) {
            return { status: "updated", filePath };
          }

          return {
            status: "needs-review",
            filePath,
            reason: "Inspect constructor mock",
          };
        },
      },
    ]);

    expect(transformedFiles).toEqual(["src/a.test.ts", "src/b.test.ts"]);
    expect(messages).toEqual([
      "  → Update mock implementation",
      "    ✓ 1 auto-fixed",
      "    ! 1 needs review",
      "      src/b.test.ts: Inspect constructor mock",
    ]);
  });

  it("logs when no files match", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "src/a.ts": "a" });

    process.chdir(cwd);

    await apiChangesTask(logUpdate, [
      {
        title: "Update tests",
        files: ["src/**/*.test.ts"],
      },
    ]);

    expect(messages).toEqual(["  → Update tests", "    - No files matched"]);
  });

  it("rechecks blocking-policy blockers after cwd file changes", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "src/a.ts": "oldApi()" });

    process.chdir(cwd);
    const sourcePath = join(process.cwd(), "src/a.ts");

    setTimeout(() => {
      writeFileSync(sourcePath, "newApi()");
    }, 50);

    await apiChangesTask(logUpdate, [
      {
        title: "Remove old API",
        policy: "blocking",
        files: ["src/**/*.ts"],
        shouldBlock: (filePath) => {
          if (!readFileSync(filePath, "utf8").includes("oldApi")) {
            return false;
          }

          return { reason: "Replace oldApi with newApi" };
        },
      },
    ]);

    expect(messages).toEqual([
      "  → Remove old API",
      "    ✗ 1 blocked",
      "      src/a.ts: Replace oldApi with newApi",
      "      → Waiting for changes under cwd...",
      "    → Rechecking after file change",
      "    ✓ Not blocked",
    ]);
  });

  it("prompts for manual-confirmation blockers instead of waiting for file changes", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "src/a.ts": "vi.restoreAllMocks();" });

    requestManualConfirmationMock.mockResolvedValueOnce(true);
    process.chdir(cwd);

    await apiChangesTask(logUpdate, [
      {
        title: "Verify mock cleanup",
        policy: "blocking",
        files: ["src/**/*.ts"],
        shouldBlock: () => ({
          kind: "manual-confirmation",
          reason:
            "vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
          prompt: "Confirm mock cleanup expectations were reviewed.",
        }),
      },
    ]);

    expect(requestManualConfirmationMock).toHaveBeenCalledWith(
      "Confirm mock cleanup expectations were reviewed.",
    );
    expect(messages).toEqual([
      "  → Verify mock cleanup",
      "    ! 1 needs confirmation",
      "      src/a.ts: vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
      "    ✓ Confirmed",
    ]);
  });

  it("fails when manual confirmation is declined", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "src/a.ts": "vi.restoreAllMocks();" });

    requestManualConfirmationMock.mockResolvedValueOnce(false);
    process.chdir(cwd);

    await expect(
      apiChangesTask(logUpdate, [
        {
          title: "Verify mock cleanup",
          policy: "blocking",
          files: ["src/**/*.ts"],
          shouldBlock: () => ({
            kind: "manual-confirmation",
            reason: "Verify mock cleanup expectations.",
          }),
        },
      ]),
    ).rejects.toThrow("API changes require attention.");

    expect(messages).toEqual([
      "  → Verify mock cleanup",
      "    ! 1 needs confirmation",
      "      src/a.ts: Verify mock cleanup expectations.",
      "    ✗ Confirmation declined",
    ]);
  });

  it("continues after logging advisory-policy blockers", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "src/a.ts": "a" });

    process.chdir(cwd);

    await apiChangesTask(logUpdate, [
      {
        title: "Review old API",
        policy: "advisory",
        files: ["src/**/*.ts"],
        shouldBlock: () => ({ reason: "Check whether oldApi is still supported" }),
      },
    ]);

    expect(messages).toEqual([
      "  → Review old API",
      "    ! 1 advisory",
      "      src/a.ts: Check whether oldApi is still supported",
    ]);
  });

  it("normalizes thrown transforms to failed results", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "src/a.ts": "a" });

    process.chdir(cwd);

    await expect(
      apiChangesTask(logUpdate, [
        {
          title: "Rewrite old API",
          files: ["src/**/*.ts"],
          transform: () => {
            throw new Error("transform failed");
          },
        },
      ]),
    ).rejects.toThrow("API changes require attention.");

    expect(messages).toEqual([
      "  → Rewrite old API",
      "    ✗ 1 failed",
      "      src/a.ts: transform failed",
    ]);
  });
});

function createProject(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-api-task-"));

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
