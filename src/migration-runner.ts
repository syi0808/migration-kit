import { apiChangesTask } from "./tasks/api-changes.js";
import { configChangesTask } from "./tasks/config-changes.js";
import { dependenciesTask } from "./tasks/dependencies.js";
import { environmentTask } from "./tasks/environment.js";
import { packageVersionTask } from "./tasks/package-version.js";
import type { MigrationRunnerOptions } from "./types.js";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createLogUpdate } from "log-update";
import { logStyle } from "./utils/log-style.js";

const logUpdate = createLogUpdate(process.stdout);

function createMigrationRunner(options: MigrationRunnerOptions): { run: () => Promise<void> } {
  const run = async () => {
    const {
      name,
      from,
      to,
      docs,
      configPath,
      environment,
      peerDependencies,
      packageVersionUpdates,
      apiChanges,
      configChanges,
    } = options;

    try {
      logUpdate.persist(logStyle.section(`${name} (${from} → ${to})`));

      if (docs) {
        logUpdate.persist(logStyle.info(`Docs: ${docs}`, 0));
      }

      if (environment && environment.length > 0) {
        logUpdate.persist(logStyle.section("Environment"));

        await environmentTask(logUpdate, environment);
      }

      if (peerDependencies && peerDependencies.length > 0) {
        logUpdate.persist(logStyle.section("Dependencies"));

        await dependenciesTask(logUpdate, peerDependencies);
      }

      if (packageVersionUpdates && packageVersionUpdates.length > 0) {
        logUpdate.persist(logStyle.section("Package Versions"));

        await packageVersionTask(logUpdate, packageVersionUpdates, { from, to });
      }

      if (configChanges && configChanges.length > 0) {
        logUpdate.persist(logStyle.section("Config Changes"));

        const foundConfigPath = findConfigPath(configPath ?? []);

        if (foundConfigPath) {
          await configChangesTask(logUpdate, configChanges, foundConfigPath);
        } else {
          logUpdate.persist(logStyle.skipped("Config file not found."));
        }
      }

      if (apiChanges && apiChanges.length > 0) {
        logUpdate.persist(logStyle.section("API Changes"));

        await apiChangesTask(logUpdate, apiChanges);
      }

      logUpdate.persist(logStyle.success(`${name} completed`, 0));
    } catch {
      logUpdate.persist(logStyle.error(`${name} failed`, 0));
    }
  };

  return { run };
}

function findConfigPath(configPath: string[]): string | null {
  for (const path of configPath) {
    const resolvedPath = isAbsolute(path) ? path : resolve(process.cwd(), path);

    if (existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  return null;
}

export { createMigrationRunner };
