import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMigrationRunner } from "./migration-runner.js";

const originalCwd = process.cwd();
const originalPath = process.env.PATH;
const tempDirectories: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  process.env.PATH = originalPath;

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("createMigrationRunner", () => {
  it("updates package versions after peer dependency checks and before transforms", async () => {
    const observedVersions: string[] = [];
    const cwd = createProject();

    process.chdir(cwd);
    process.env.PATH = `${createFakePackageManager(cwd, "pnpm")}${delimiter}${originalPath ?? ""}`;

    const runner = createMigrationRunner({
      name: "Target Package Migration",
      from: "1.x",
      to: "2.x",
      peerDependencies: [{ dependency: "vite", requiredVersion: ">=6.0.0" }],
      packageVersionUpdates: [{ dependency: "target-package", to: "^2.0.0" }],
      configPath: ["target.config.ts"],
      configChanges: [
        {
          title: "Config transform",
          transform: (filePath) => {
            observedVersions.push(`config:${readTargetPackageVersion(cwd)}`);

            return { status: "unchanged", filePath };
          },
        },
      ],
      apiChanges: [
        {
          title: "API transform",
          files: ["src/index.ts"],
          transform: (filePath) => {
            observedVersions.push(`api:${readTargetPackageVersion(cwd)}`);

            return { status: "unchanged", filePath };
          },
        },
      ],
    });

    await runner.run();

    expect(observedVersions).toEqual(["config:^2.0.0", "api:^2.0.0"]);
  });
});

function createProject(): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-runner-"));

  tempDirectories.push(directory);
  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(join(directory, "target.config.ts"), "export default {};\n");
  writeFileSync(join(directory, "src/index.ts"), "export const value = 1;\n");
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        packageManager: "pnpm@10.32.0",
        dependencies: {
          vite: "^6.0.0",
        },
        devDependencies: {
          "target-package": "^1.2.0",
        },
      },
      null,
      2,
    )}\n`,
  );

  return directory;
}

function createFakePackageManager(cwd: string, packageManager: string): string {
  const binDirectory = join(cwd, "bin");
  const commandPath = join(binDirectory, packageManager);

  mkdirSync(binDirectory, { recursive: true });
  writeFileSync(commandPath, "#!/bin/sh\nexit 0\n");
  chmodSync(commandPath, 0o755);

  return binDirectory;
}

function readTargetPackageVersion(cwd: string): string {
  const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));

  return packageJson.devDependencies["target-package"];
}
