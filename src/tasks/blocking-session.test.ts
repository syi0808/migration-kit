import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { stripAnsi } from "../utils/log-style.js";
import { MigrationRenderer, type LogUpdate } from "../utils/renderer.js";
import { runBlockingSession } from "./blocking-session.js";

const originalCwd = process.cwd();
const tempDirectories: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("runBlockingSession", () => {
  it("copies all current manual fixes when c is pressed while watching", async () => {
    const messages: string[] = [];
    const liveMessages: string[] = [];
    const copiedTexts: string[] = [];
    const logUpdate = createTestLogUpdate(messages, liveMessages);
    const input = createTestInput();
    const cwd = createProject({
      "src/a.ts": "oldApi()",
      "src/b.ts": "oldApi()",
    });

    process.chdir(cwd);

    setTimeout(() => {
      input.write("c");
    }, 25);
    setTimeout(() => {
      writeFileSync(join(cwd, "src/a.ts"), "newApi()");
      writeFileSync(join(cwd, "src/b.ts"), "newApi()");
    }, 100);

    await runBlockingSession({
      renderer: logUpdate,
      policy: "blocking",
      input,
      copy: async (text) => {
        copiedTexts.push(text);
      },
      collectSnapshot: () => {
        const manualFixes = ["src/a.ts", "src/b.ts"]
          .filter((fileName) => readFileSync(join(cwd, fileName), "utf8").includes("oldApi"))
          .map((fileName) => ({
            key: fileName,
            detail: `${fileName}: Replace oldApi with newApi`,
          }));

        return { manualFixes, confirmations: [], failures: [] };
      },
    });

    expect(copiedTexts).toEqual([
      [
        "2 manual fixes remaining:",
        "- src/a.ts: Replace oldApi with newApi",
        "- src/b.ts: Replace oldApi with newApi",
      ].join("\n"),
    ]);
    expect(liveMessages).toContain(
      [
        "    → Watching for project changes (2 manual fixes remaining). Press c to copy fixes.",
        "    ✓ Copied 2 fixes to clipboard.",
      ].join("\n"),
    );
    expect(messages).toEqual([
      "    ✗ 2 manual fixes required",
      "      src/a.ts: Replace oldApi with newApi",
      "      src/b.ts: Replace oldApi with newApi",
      "    ✓ Manual fixes resolved",
      "    ✓ Resolved",
    ]);
  });
});

type TestInput = PassThrough & {
  isTTY: boolean;
  isRaw: boolean;
  setRawMode: (mode: boolean) => TestInput;
};

function createTestInput(): TestInput {
  const input = new PassThrough() as TestInput;

  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (mode: boolean) => {
    input.isRaw = mode;
    return input;
  };

  return input;
}

function createProject(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-blocking-session-"));

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
