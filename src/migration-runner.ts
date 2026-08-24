import { apiChangesTask } from "./tasks/api-changes.js";
import { configChangesTask } from "./tasks/config-changes.js";
import { dependenciesTask } from "./tasks/dependencies.js";
import { environmentTask } from "./tasks/environment.js";
import { packageVersionTask } from "./tasks/package-version.js";
import type {
  ApiChange,
  ConfigChange,
  MigrationRunnerOptions,
  ResolvedApiChange,
  ResolvedConfigChange,
  ResolvedMigrationRunnerOptions,
} from "./types.js";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createMigrationRuntime, runWithMigrationRuntime } from "./migration-runtime.js";
import { MigrationRenderer } from "./utils/renderer.js";

const renderer = MigrationRenderer.stdout();

function createMigrationRunner(options: MigrationRunnerOptions): { run: () => Promise<void> } {
  const resolvedOptions = resolveMigrationRunnerOptions(options);

  const run = async (): Promise<void> => {
    const runtime = createMigrationRuntime();

    await runWithMigrationRuntime(runtime, async (): Promise<void> => {
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
      } = resolvedOptions;

      try {
        renderer.section(`${name} (${from} → ${to})`);

        if (docs) {
          renderer.info(`Docs: ${docs}`, 0);
        }

        if (environment.length > 0) {
          renderer.section("Environment");

          await environmentTask(renderer, environment);
        }

        if (peerDependencies.length > 0) {
          renderer.section("Dependencies");

          await dependenciesTask(renderer, peerDependencies);
        }

        if (packageVersionUpdates.length > 0) {
          renderer.section("Package Versions");

          await packageVersionTask(renderer, packageVersionUpdates);
        }

        if (configChanges.length > 0) {
          renderer.section("Config Changes");

          const foundConfigPath = findConfigPath(configPath);

          if (foundConfigPath) {
            await configChangesTask(renderer, configChanges, foundConfigPath);
          } else {
            renderer.skipped("Config file not found.");
          }
        }

        if (apiChanges.length > 0) {
          renderer.section("API Changes");

          await apiChangesTask(renderer, apiChanges);
        }

        renderer.success(`${name} completed`, 0);
      } catch {
        renderer.error(`${name} failed`, 0);
      }
    });
  };

  return { run };
}

function resolveMigrationRunnerOptions(
  options: MigrationRunnerOptions,
): ResolvedMigrationRunnerOptions {
  return {
    name: options.name,
    from: options.from,
    to: options.to,
    ...(options.docs !== undefined ? { docs: options.docs } : {}),
    configPath: options.configPath ?? [],
    environment: options.environment ?? [],
    peerDependencies: options.peerDependencies ?? [],
    packageVersionUpdates: (options.packageVersionUpdates ?? []).map((update) => ({
      dependency: update.dependency,
      from: update.from ?? options.from,
      to: update.to ?? options.to,
    })),
    configChanges: (options.configChanges ?? []).map(resolveConfigChange),
    apiChanges: (options.apiChanges ?? []).map(resolveApiChange),
  };
}

function resolveConfigChange(change: ConfigChange): ResolvedConfigChange {
  return {
    ...change,
    policy: change.policy ?? "blocking",
  };
}

function resolveApiChange(change: ApiChange): ResolvedApiChange {
  return {
    ...change,
    policy: change.policy ?? "blocking",
  };
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
