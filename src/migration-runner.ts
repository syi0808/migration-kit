import { apiChangesTask } from "./tasks/api-changes.js";
import { configChangesTask } from "./tasks/config-changes.js";
import { dependenciesTask } from "./tasks/dependencies.js";
import { environmentTask } from "./tasks/environment.js";
import type { MigrationRunnerOptions } from "./types.js";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createLogUpdate } from "log-update";

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
      apiChanges,
      configChanges,
    } = options;

    try {
      logUpdate.persist(`${name} (${from} -> ${to})`);

      if (docs) {
        logUpdate.persist(`Docs: ${docs}`);
      }

      if (environment && environment.length > 0) {
        logUpdate.persist("Environment");

        await environmentTask(logUpdate, environment);
      }

      if (peerDependencies && peerDependencies.length > 0) {
        logUpdate.persist("Dependencies");

        await dependenciesTask(logUpdate, peerDependencies);
      }

      if (configChanges && configChanges.length > 0) {
        logUpdate.persist("Config Changes");

        const foundConfigPath = findConfigPath(configPath ?? []);

        if (foundConfigPath) {
          await configChangesTask(logUpdate, configChanges, foundConfigPath);
        } else {
          logUpdate.persist("Config file not found.");
        }
      }

      if (apiChanges && apiChanges.length > 0) {
        logUpdate.persist("API Changes");

        await apiChangesTask(logUpdate, apiChanges);
      }

      logUpdate.persist(`${name} Completed!`);
    } catch {
      logUpdate.persist(`${name} Failed!`);
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
