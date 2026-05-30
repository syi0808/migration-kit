import type { createLogUpdate } from "log-update";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stripAnsi } from "../utils/log-style.js";
import { detectPackageManager, packageVersionTask } from "./package-version.js";
import type {
  PackageManager,
  ResolvePackageVersion,
  RunPackageManagerInstall,
} from "./package-version.js";

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
      "  → Detected pnpm package manager (packageManager)",
      "  ✓ vitest ^3.2.0 → ^4.0.0 (devDependencies)",
      "  ✓ @vitest/ui workspace:^3.2.0 → workspace:^4.0.0 (devDependencies)",
      "  ✓ Dependencies installed with pnpm",
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
      "  → Detected npm package manager (packageManager)",
      "  - vitest already satisfies ^4.0.0",
      "  - @vitest/ui not found",
      "  ✓ Package versions already up to date",
    ]);
  });

  it("resolves wildcard target ranges to latest matching package versions", async () => {
    const messages: string[] = [];
    const installs: Array<{ packageManager: PackageManager; cwd: string }> = [];
    const packageVersionResolutions: Array<{ dependency: string; versionRange: string }> = [];
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
        { dependency: "vitest", to: "4.x" },
        { dependency: "@vitest/ui", to: "4.x" },
      ],
      {
        cwd,
        from: "3.x",
        to: "4.x",
        resolvePackageVersion: recordPackageVersionResolution(packageVersionResolutions, {
          "vitest@4.x": "4.1.7",
          "@vitest/ui@4.x": "4.1.7",
        }),
        runInstall: recordInstall(installs),
      },
    );

    const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));

    expect(packageJson.devDependencies).toEqual({
      vitest: "4.1.7",
      "@vitest/ui": "workspace:4.1.7",
    });
    expect(packageVersionResolutions).toEqual([
      { dependency: "vitest", versionRange: "4.x" },
      { dependency: "@vitest/ui", versionRange: "4.x" },
    ]);
    expect(installs).toEqual([{ packageManager: "pnpm", cwd }]);
    expect(messages).toEqual([
      "  → Detected pnpm package manager (packageManager)",
      "  ✓ vitest ^3.2.0 → 4.1.7 (devDependencies)",
      "  ✓ @vitest/ui workspace:^3.2.0 → workspace:4.1.7 (devDependencies)",
      "  ✓ Dependencies installed with pnpm",
    ]);
  });

  it("normalizes packages already in the wildcard target range to the latest version", async () => {
    const messages: string[] = [];
    const installs: Array<{ packageManager: PackageManager; cwd: string }> = [];
    const cwd = createProject({
      packageManager: "npm@11.0.0",
      devDependencies: {
        vitest: "^4.0.0",
      },
    });

    await packageVersionTask(createTestLogUpdate(messages), [{ dependency: "vitest" }], {
      cwd,
      from: "3.x",
      to: "4.x",
      resolvePackageVersion: async () => "4.1.7",
      runInstall: recordInstall(installs),
    });

    const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));

    expect(packageJson.devDependencies.vitest).toBe("4.1.7");
    expect(installs).toEqual([{ packageManager: "npm", cwd }]);
    expect(messages).toEqual([
      "  → Detected npm package manager (packageManager)",
      "  ✓ vitest ^4.0.0 → 4.1.7 (devDependencies)",
      "  ✓ Dependencies installed with npm",
    ]);
  });

  it("updates a rolling install output preview and replaces it when install completes", async () => {
    const messages: string[] = [];
    const updates: string[] = [];
    const cwd = createProject({
      packageManager: "pnpm@10.32.0",
      devDependencies: {
        vitest: "^3.2.0",
      },
    });

    await packageVersionTask(
      createTestLogUpdate(messages, updates),
      [{ dependency: "vitest", to: "^4.0.0" }],
      {
        cwd,
        from: "3.x",
        to: "4.x",
        runInstall: async (_packageManager, _cwd, onOutput) => {
          onOutput?.("line 1\nline 2\n");
          onOutput?.("line 3\nline 4\nline 5\npartial");
          onOutput?.(" done\n");
        },
      },
    );

    expect(updates).toEqual([
      "  → Installing dependencies with pnpm...",
      "  → Installing dependencies with pnpm...\n    line 1\n    line 2",
      "  → Installing dependencies with pnpm...\n    line 3\n    line 4\n    line 5\n    partial",
      "  → Installing dependencies with pnpm...\n    line 3\n    line 4\n    line 5\n    partial done",
    ]);
    expect(messages).toEqual([
      "  → Detected pnpm package manager (packageManager)",
      "  ✓ vitest ^3.2.0 → ^4.0.0 (devDependencies)",
      "  ✓ Dependencies installed with pnpm",
    ]);
  });

  it("fails when a wildcard target range cannot be resolved", async () => {
    const messages: string[] = [];
    const installs: Array<{ packageManager: PackageManager; cwd: string }> = [];
    const cwd = createProject({
      packageManager: "pnpm@10.32.0",
      devDependencies: {
        vitest: "^3.2.0",
      },
    });

    await expect(
      packageVersionTask(createTestLogUpdate(messages), [{ dependency: "vitest", to: "4.x" }], {
        cwd,
        from: "3.x",
        to: "4.x",
        resolvePackageVersion: async () => null,
        runInstall: recordInstall(installs),
      }),
    ).rejects.toThrow("Package version updates failed.");

    const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));

    expect(packageJson.devDependencies.vitest).toBe("^3.2.0");
    expect(installs).toEqual([]);
    expect(messages).toEqual([
      "  → Detected pnpm package manager (packageManager)",
      "  ✗ vitest could not resolve target 4.x",
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
      "  → Detected pnpm package manager (packageManager)",
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

function recordPackageVersionResolution(
  resolutions: Array<{ dependency: string; versionRange: string }>,
  versions: Record<string, string>,
): ResolvePackageVersion {
  return async (dependency, versionRange) => {
    resolutions.push({ dependency, versionRange });

    return versions[`${dependency}@${versionRange}`] ?? null;
  };
}

function createTestLogUpdate(
  messages: string[],
  updates: string[] = [],
): ReturnType<typeof createLogUpdate> {
  return Object.assign(
    (text = "") => {
      updates.push(stripAnsi(text));
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
