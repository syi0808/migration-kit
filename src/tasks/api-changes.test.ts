import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestManualConfirmation } from "../utils/manual-confirmation.js";
import { stripAnsi } from "../utils/log-style.js";
import { MigrationRenderer, type LogUpdate } from "../utils/renderer.js";
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
        policy: "blocking",
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
        policy: "blocking",
        files: ["src/**/*.test.ts"],
      },
    ]);

    expect(messages).toEqual(["  → Update tests", "    - No files matched"]);
  });

  it("renders progress while running transforms across many files", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
    const cwd = createProject(
      Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`src/${index}.ts`, "a"])),
    );

    process.chdir(cwd);

    await apiChangesTask(logUpdate, [
      {
        title: "Scan source files",
        policy: "blocking",
        files: ["src/**/*.ts"],
        transform: (filePath) => ({ status: "unchanged", filePath }),
      },
    ]);

    expect(liveMessages[0]).toBe(
      "    → Running transforms [--------------------] 0/20 files\n      src/0.ts",
    );
    expect(liveMessages.at(-1)).toBe(
      "    → Running transforms [####################] 20/20 files\n      src/9.ts",
    );
    expect(messages).toEqual(["  → Scan source files", "    ✓ 20 unchanged"]);
  });

  it("renders progress while checking blockers across many files", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
    const cwd = createProject(
      Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`src/${index}.ts`, "oldApi()"])),
    );

    process.chdir(cwd);

    await apiChangesTask(logUpdate, [
      {
        title: "Review source files",
        policy: "advisory",
        files: ["src/**/*.ts"],
        shouldBlock: (filePath) => {
          return readFileSync(filePath, "utf8").includes("oldApi")
            ? { reason: "Replace oldApi with newApi" }
            : false;
        },
      },
    ]);

    expect(liveMessages[0]).toBe(
      "    → Checking blockers [--------------------] 0/20 files\n      src/0.ts",
    );
    expect(liveMessages.at(-1)).toBe(
      "    → Checking blockers [####################] 20/20 files\n      src/9.ts",
    );
    expect(messages).toEqual([
      "  → Review source files",
      "    ! 20 advisories",
      "      src/0.ts: Replace oldApi with newApi",
      "      src/1.ts: Replace oldApi with newApi",
      "      src/10.ts: Replace oldApi with newApi",
      "      src/11.ts: Replace oldApi with newApi",
      "      src/12.ts: Replace oldApi with newApi",
      "      src/13.ts: Replace oldApi with newApi",
      "      src/14.ts: Replace oldApi with newApi",
      "      src/15.ts: Replace oldApi with newApi",
      "      src/16.ts: Replace oldApi with newApi",
      "      src/17.ts: Replace oldApi with newApi",
      "      ... 10 more items hidden",
    ]);
  });

  it("keeps recheck details out of permanent logs while blockers are fixed", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
    const cwd = createProject({ "src/a.ts": "oldApi()", "src/b.ts": "oldApi()" });

    process.chdir(cwd);
    const firstSourcePath = join(process.cwd(), "src/a.ts");
    const secondSourcePath = join(process.cwd(), "src/b.ts");

    setTimeout(() => {
      writeFileSync(firstSourcePath, "newApi()");
    }, 50);
    setTimeout(() => {
      writeFileSync(secondSourcePath, "newApi()");
    }, 300);

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
      "    ✗ 2 manual fixes required",
      "      src/a.ts: Replace oldApi with newApi",
      "      src/b.ts: Replace oldApi with newApi",
      "    ✓ Manual fixes resolved",
      "    ✓ Resolved",
    ]);
    expect(liveMessages).toEqual([
      "    → Watching for project changes (2 manual fixes remaining). Press c to copy fixes.",
      "    → Watching for project changes (1 manual fix remaining). Press c to copy fixes.",
    ]);
  });

  it("prompts for manual-confirmation blockers instead of waiting for file changes", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
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
      "src/a.ts: Confirm mock cleanup expectations were reviewed.",
    );
    expect(messages).toEqual([
      "  → Verify mock cleanup",
      "    ✓ 1 confirmation acknowledged",
      "    ✓ Resolved",
    ]);
    expect(liveMessages).toEqual([
      "    ! 1 confirmation required\n      src/a.ts: vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
    ]);
  });

  it("prompts each manual-confirmation blocker separately", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({ "src/a.ts": "vi.restoreAllMocks(); viteNodeUsage();" });

    requestManualConfirmationMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    process.chdir(cwd);

    await apiChangesTask(logUpdate, [
      {
        title: "Verify review-only findings",
        policy: "blocking",
        files: ["src/**/*.ts"],
        shouldBlock: () => [
          {
            kind: "manual-confirmation",
            reason: "Verify mock cleanup expectations.",
            prompt: "Confirm mock cleanup expectations were reviewed.",
          },
          {
            kind: "manual-confirmation",
            reason: "Verify vite-node direct usage.",
            prompt: "Confirm vite-node usage was reviewed.",
          },
        ],
      },
    ]);

    expect(requestManualConfirmationMock).toHaveBeenNthCalledWith(
      1,
      "src/a.ts: Confirm mock cleanup expectations were reviewed.",
    );
    expect(requestManualConfirmationMock).toHaveBeenNthCalledWith(
      2,
      "src/a.ts: Confirm vite-node usage was reviewed.",
    );
    expect(messages).toEqual([
      "  → Verify review-only findings",
      "    ✓ 2 confirmations acknowledged",
      "    ✓ Resolved",
    ]);
  });

  it("prompts manual-confirmation blockers before watching remaining manual fixes", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
    const cwd = createProject({ "src/a.ts": "oldApi(); vi.restoreAllMocks();" });

    process.chdir(cwd);
    const sourcePath = join(process.cwd(), "src/a.ts");

    requestManualConfirmationMock.mockImplementationOnce(async () => {
      expect(readFileSync(sourcePath, "utf8")).toBe("oldApi(); vi.restoreAllMocks();");
      return true;
    });

    setTimeout(() => {
      writeFileSync(sourcePath, "newApi(); vi.restoreAllMocks();");
    }, 50);

    await apiChangesTask(logUpdate, [
      {
        title: "Review mixed API findings",
        policy: "blocking",
        files: ["src/**/*.ts"],
        shouldBlock: (filePath) => {
          const source = readFileSync(filePath, "utf8");
          const findings = [];

          if (source.includes("oldApi")) {
            findings.push({ kind: "manual-fix" as const, reason: "Replace oldApi with newApi" });
          }

          if (source.includes("vi.restoreAllMocks")) {
            findings.push({
              kind: "manual-confirmation" as const,
              reason: "Verify mock cleanup expectations.",
              prompt: "Confirm mock cleanup expectations were reviewed.",
            });
          }

          return findings.length > 0 ? findings : false;
        },
      },
    ]);

    expect(requestManualConfirmationMock).toHaveBeenCalledTimes(1);
    expect(requestManualConfirmationMock).toHaveBeenCalledWith(
      "src/a.ts: Confirm mock cleanup expectations were reviewed.",
    );
    expect(messages).toEqual([
      "  → Review mixed API findings",
      "    ✓ 1 confirmation acknowledged",
      "    ✗ 1 manual fix required",
      "      src/a.ts: Replace oldApi with newApi",
      "    ✓ Manual fixes resolved",
      "    ✓ Resolved",
    ]);
    expect(liveMessages).toEqual([
      "    ! 1 confirmation required\n      src/a.ts: Verify mock cleanup expectations.",
      "    → Watching for project changes (1 manual fix remaining). Press c to copy fixes.",
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
      "    ✗ Confirmation declined: src/a.ts: Verify mock cleanup expectations.",
    ]);
  });

  it("caps large blocker summaries", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
    const files = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`src/${index}.ts`, "oldApi()"]),
    );
    const cwd = createProject(files);

    process.chdir(cwd);

    setTimeout(() => {
      for (let index = 0; index < 12; index += 1) {
        writeFileSync(join(process.cwd(), `src/${index}.ts`), "newApi()");
      }
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
      "    ✗ 12 manual fixes required",
      "      src/0.ts: Replace oldApi with newApi",
      "      src/1.ts: Replace oldApi with newApi",
      "      src/10.ts: Replace oldApi with newApi",
      "      src/11.ts: Replace oldApi with newApi",
      "      src/2.ts: Replace oldApi with newApi",
      "      src/3.ts: Replace oldApi with newApi",
      "      src/4.ts: Replace oldApi with newApi",
      "      src/5.ts: Replace oldApi with newApi",
      "      src/6.ts: Replace oldApi with newApi",
      "      src/7.ts: Replace oldApi with newApi",
      "      ... 2 more items hidden",
      "    ✓ Manual fixes resolved",
      "    ✓ Resolved",
    ]);
    expect(liveMessages).toEqual([
      "    → Watching for project changes (12 manual fixes remaining). Press c to copy fixes.",
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
          policy: "blocking",
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

function createTestLogUpdate(messages: string[], liveMessages: string[] = []): MigrationRenderer {
  const logUpdate = Object.assign(
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
  ) as LogUpdate;

  return new MigrationRenderer(logUpdate);
}
