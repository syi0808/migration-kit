import type { createLogUpdate } from "log-update";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dependenciesTask } from "./dependencies.js";

const originalCwd = process.cwd();
const tempDirectories: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("dependenciesTask", () => {
  it("logs satisfied package.json dependency requirements", () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({
      dependencies: { vite: "^6.0.0" },
      devDependencies: { vitest: ">=4.0.0" },
    });

    process.chdir(cwd);

    dependenciesTask(logUpdate, [
      { dependency: "vite", requiredVersion: ">=6.0.0" },
      { dependency: "vitest", requiredVersion: ">=4.0.0" },
    ]);

    expect(messages).toEqual(["  ✓ vite >=6.0.0 satisfied", "  ✓ vitest >=4.0.0 satisfied"]);
  });

  it("throws after logging dependency requirements that are not met", () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({
      dependencies: { vite: "^5.0.0" },
    });

    process.chdir(cwd);

    expect(() =>
      dependenciesTask(logUpdate, [
        { dependency: "vite", requiredVersion: ">=6.0.0" },
        { dependency: "vitest", requiredVersion: ">=4.0.0" },
      ]),
    ).toThrow("Dependency requirements were not met.");
    expect(messages).toEqual([
      "  ✗ vite >=6.0.0 required, current ^5.0.0",
      "  ✗ vitest >=4.0.0 required, dependency not found",
    ]);
  });

  it("checks workspace protocol ranges when they include a semver range", () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({
      dependencies: { vite: "workspace:^6.0.0" },
    });

    process.chdir(cwd);

    dependenciesTask(logUpdate, [{ dependency: "vite", requiredVersion: ">=6.0.0" }]);

    expect(messages).toEqual(["  ✓ vite >=6.0.0 satisfied"]);
  });

  it("fails dependency requirements that cannot be checked from package.json", () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const cwd = createProject({
      dependencies: { vite: "latest" },
    });

    process.chdir(cwd);

    expect(() =>
      dependenciesTask(logUpdate, [{ dependency: "vite", requiredVersion: ">=6.0.0" }]),
    ).toThrow("Dependency requirements were not met.");
    expect(messages).toEqual(["  ✗ vite >=6.0.0 required, current latest cannot be checked"]);
  });
});

function createProject(packageJson: Record<string, unknown>): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-project-"));

  tempDirectories.push(directory);
  writeFileSync(join(directory, "package.json"), JSON.stringify(packageJson));

  return directory;
}

function createTestLogUpdate(messages: string[]): ReturnType<typeof createLogUpdate> {
  return Object.assign(() => {}, {
    clear: () => {},
    done: () => {},
    persist: (...text: string[]) => {
      messages.push(text.join(" "));
    },
  });
}
