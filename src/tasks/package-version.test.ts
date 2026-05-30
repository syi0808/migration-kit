import type { createLogUpdate } from "log-update";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectPackageManager, packageVersionTask } from "./package-version.js";
import type { PackageManager, RunPackageManagerInstall } from "./package-version.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("packageVersionTask", () => {
  it("updates matching package ranges and runs the detected package manager install", async () => {
    const messages: string[] = [];
    const installs: Array<{ packageManager: PackageManager; cwd: string }> = [];
    const cwd = createProject({
      packageManager: "pnpm@10.32.0",
      devDependencies: {
        vitest: "^3.2.0",
        "@vitest/ui": "workspace:^3.2.0",
      },
    });

    await packageVersionTask(
      createTestLogUpdate(messages),
      [
        { dependency: "vitest", to: "^4.0.0" },
        { dependency: "@vitest/ui", to: "^4.0.0" },
      ],
      {
        cwd,
        from: "3.x",
        to: "4.x",
        runInstall: recordInstall(installs),
      },
    );

    const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));

    expect(packageJson.devDependencies).toEqual({
      vitest: "^4.0.0",
      "@vitest/ui": "workspace:^4.0.0",
    });
    expect(installs).toEqual([{ packageManager: "pnpm", cwd }]);
    expect(messages).toEqual([
      "  ✓ Detected pnpm package manager (packageManager)",
      "  ✓ vitest ^3.2.0 -> ^4.0.0 (devDependencies)",
      "  ✓ @vitest/ui workspace:^3.2.0 -> workspace:^4.0.0 (devDependencies)",
      "  ✓ Installed dependencies with pnpm",
    ]);
  });

  it("does not install when package versions are already current or missing", async () => {
    const messages: string[] = [];
    const installs: Array<{ packageManager: PackageManager; cwd: string }> = [];
    const cwd = createProject({
      packageManager: "npm@11.0.0",
      devDependencies: {
        vitest: "^4.1.0",
      },
    });

    await packageVersionTask(
      createTestLogUpdate(messages),
      [
        { dependency: "vitest", to: "^4.0.0" },
        { dependency: "@vitest/ui", to: "^4.0.0" },
      ],
      {
        cwd,
        from: "3.x",
        to: "4.x",
        runInstall: recordInstall(installs),
      },
    );

    expect(installs).toEqual([]);
    expect(messages).toEqual([
      "  ✓ Detected npm package manager (packageManager)",
      "  - vitest already satisfies ^4.0.0",
      "  - @vitest/ui not found",
      "  ✓ Package versions already up to date",
    ]);
  });

  it("fails when a configured package exists outside the source range", async () => {
    const messages: string[] = [];
    const installs: Array<{ packageManager: PackageManager; cwd: string }> = [];
    const cwd = createProject({
      packageManager: "pnpm@10.32.0",
      devDependencies: {
        vitest: "^2.0.0",
      },
    });

    await expect(
      packageVersionTask(createTestLogUpdate(messages), [{ dependency: "vitest", to: "^4.0.0" }], {
        cwd,
        from: "3.x",
        to: "4.x",
        runInstall: recordInstall(installs),
      }),
    ).rejects.toThrow("Package version updates failed.");

    const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));

    expect(packageJson.devDependencies.vitest).toBe("^2.0.0");
    expect(installs).toEqual([]);
    expect(messages).toEqual([
      "  ✓ Detected pnpm package manager (packageManager)",
      "  ✗ vitest expected 3.x, current ^2.0.0",
    ]);
  });
});

describe("detectPackageManager", () => {
  it("prefers packageManager metadata over lockfiles", () => {
    const cwd = createProject({ packageManager: "yarn@4.10.0" }, ["pnpm-lock.yaml"]);

    expect(detectPackageManager(cwd, { packageManager: "yarn@4.10.0" })).toEqual({
      packageManager: "yarn",
      source: "packageManager",
    });
  });

  it("detects package managers from lockfiles", () => {
    const cwd = createProject({}, ["bun.lock"]);

    expect(detectPackageManager(cwd, {})).toEqual({
      packageManager: "bun",
      source: "bun.lock",
    });
  });
});

function createProject(packageJson: Record<string, unknown>, fileNames: string[] = []): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-package-version-"));

  tempDirectories.push(directory);
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

  for (const fileName of fileNames) {
    writeFileSync(join(directory, fileName), "");
  }

  return directory;
}

function recordInstall(
  installs: Array<{ packageManager: PackageManager; cwd: string }>,
): RunPackageManagerInstall {
  return async (packageManager, cwd) => {
    installs.push({ packageManager, cwd });
  };
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
