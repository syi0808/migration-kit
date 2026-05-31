#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createMigrationRunner, runtime, type PackageVersionUpdate } from "migration-kit";
import { apiChanges } from "./api-changes/index.js";
import { configChanges } from "./config-changes/index.js";
import { configPaths } from "./patterns.js";
import { formatCliError } from "./utils/log-style.js";
import { vitestFamilyPackages } from "./utils/package-json.js";

const vitestPackageVersionUpdates = [
  { dependency: "vitest", from: "3.x", to: "4.x" },
  ...vitestFamilyPackages
    .filter((dependency) => dependency !== "vitest")
    .map((dependency) => ({
      dependency,
      from: "3.x",
      to: "4.x",
    })),
] satisfies PackageVersionUpdate[];

function createVitest3To4MigrationRunner() {
  return createMigrationRunner({
    name: "Vitest 3 to 4 Migration",
    from: "3.x",
    to: "4.x",
    docs: "https://vitest.dev/guide/migration.html#vitest-4",
    configPath: configPaths,
    environment: [runtime.node({ version: ">=20.0.0" })],
    peerDependencies: [{ dependency: "vite", requiredVersion: ">=6.0.0" }],
    packageVersionUpdates: vitestPackageVersionUpdates,
    configChanges,
    apiChanges,
  });
}

const migrationRunner = createVitest3To4MigrationRunner();

if (isDirectCliInvocation()) {
  migrationRunner.run().catch((error: unknown) => {
    console.error(formatCliError(error));
    process.exitCode = 1;
  });
}

function isDirectCliInvocation(): boolean {
  const entryPoint = process.argv[1];

  return Boolean(entryPoint && import.meta.url === pathToFileURL(entryPoint).href);
}

export { createVitest3To4MigrationRunner, migrationRunner };
