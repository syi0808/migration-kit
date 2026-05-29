import type { MigrationRunnerOptions } from "./types.js";
import { createLogUpdate } from "log-update";

const logUpdate = createLogUpdate(process.stdout);

function createMigrationRunner(options: MigrationRunnerOptions): void {
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

    // ...
  }

  if (peerDependencies && peerDependencies.length > 0) {
    logUpdate.persist("Dependencies");

    // ...
  }

  if (configChanges && configChanges.length > 0) {
    logUpdate.persist("Config Changes");

    // ...
  }

  if (apiChanges && apiChanges.length < 0) {
    logUpdate.persist("API Changes");

    // ...
  }

  logUpdate.persist(`${name} Completed!`);
}

export { createMigrationRunner };
