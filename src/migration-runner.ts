import { apiChangesTask } from "./tasks/api-changes.js";
import { configChangesTask } from "./tasks/config-changes.js";
import { dependenciesTask } from "./tasks/dependencies.js";
import { environmentTask } from "./tasks/environment.js";
import type { MigrationRunnerOptions } from "./types.js";
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

    logUpdate.persist(`${name} (${from} -> ${to})`);

    if (docs) {
      logUpdate.persist(`Docs: ${docs}`);
    }

    if (environment && environment.length > 0) {
      logUpdate.persist("Environment");

      try {
        await environmentTask(logUpdate, environment);
      } catch {}
    }

    if (peerDependencies && peerDependencies.length > 0) {
      logUpdate.persist("Dependencies");

      try {
        await dependenciesTask(logUpdate, peerDependencies);
      } catch {}
    }

    if (configChanges && configChanges.length > 0) {
      logUpdate.persist("Config Changes");

      const findedConfigPath = configPath?.at(0); // TODO: Find config file with configPath

      if (findedConfigPath) {
        try {
          await configChangesTask(logUpdate, configChanges, findedConfigPath);
        } catch {}
      } else {
        logUpdate.persist("Config file not founded.");
      }
    }

    if (apiChanges && apiChanges.length < 0) {
      logUpdate.persist("API Changes");

      try {
        await apiChangesTask(logUpdate, apiChanges);
      } catch {}
    }

    logUpdate.persist(`${name} Completed!`);
  };

  return { run };
}

export { createMigrationRunner };
