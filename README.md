# migration-kit

`migration-kit` is a library for building project-specific migration runners. It helps migration packages check runtime and dependency requirements, scan config files, run code transforms, and stop when a change still needs human review.

## Features

- **Migration runner** - Run environment checks, dependency checks, package version updates, config changes, and API changes in one ordered flow.
- **Runtime checks** - Verify Node.js, Bun, or Deno availability and semver ranges through commands and common project version files.
- **Dependency requirements** - Check declared package ranges in `package.json` dependencies, dev dependencies, optional dependencies, and peer dependencies.
- **Package version updates** - Detect npm, pnpm, Yarn, or Bun and update configured package ranges before transforms run.
- **Config change handling** - Run a transform against the first matching config file and keep rechecking error-level blockers after files change.
- **API change scanning** - Find files with `tinyglobby`, run transforms, and summarize updated, unchanged, failed, and needs-review files.
- **Transformer helpers** - Wrap `jscodeshift` and `ast-grep` transforms behind the shared `Transformer` result contract.

## Getting Started

### Install

Install `migration-kit` in the project that owns your migration runner:

```bash
pnpm add migration-kit
```

If you use the built-in transformer helpers, install their peer dependencies too:

```bash
pnpm add ast-grep jscodeshift
```

## Usage

Create a migration runner by describing the checks and transforms that make up the migration.

```ts
import { readFileSync } from "node:fs";
import { createMigrationRunner, runtime, transformer } from "migration-kit";

const migrationRunner = createMigrationRunner({
  name: "Migration Runner",
  from: "1.x",
  to: "2.x",
  configPath: ["migration.config.ts"],
  environment: [runtime.node({ version: ">=20.0.0" })],
  peerDependencies: [{ dependency: "target-package", requiredVersion: ">=2.0.0" }],
  packageVersionUpdates: [{ dependency: "target-package", to: "2.x" }],
  configChanges: [
    {
      title: "Review removed config option",
      description: "legacyMode was removed in 2.x.",
      level: "warning",
      shouldBlock: (filePath) => {
        const source = readFileSync(filePath, "utf8");

        return source.includes("legacyMode")
          ? { reason: "Remove legacyMode from the migration config." }
          : false;
      },
    },
  ],
  apiChanges: [
    {
      title: "Replace legacy API calls",
      level: "warning",
      files: ["src/**/*.ts", "test/**/*.ts"],
      transform: transformer.astGrep("legacyApi()", { replace: "nextApi()" }),
    },
  ],
});

await migrationRunner.run();
```

The runner executes work in this order:

1. Print the migration name, version range, and docs URL when one is provided.
2. Run environment checks. Failed environment checks are reported without stopping the run.
3. Check required dependencies from `package.json`. Failed dependency checks stop the migration.
4. Detect the package manager, update configured package ranges from the migration `from` range to the `to` range, and run the package manager install command.
5. Find the first existing config file from `configPath`, run config transforms, and recheck error-level blockers after project files change.
6. Scan API change file globs, run transforms, summarize results, and recheck error-level blockers after project files change.

## API

### `createMigrationRunner(options)`

Creates a runner with a single async `run()` method.

```ts
const runner = createMigrationRunner({
  name: "Example Migration",
  from: "1",
  to: "2",
});

await runner.run();
```

The options object supports:

- `name`, `from`, `to`, and optional `docs` metadata
- `environment` checks that return pass/fail results
- `peerDependencies` requirements checked against the current working directory's `package.json`
- `packageVersionUpdates` for dependency ranges that should be updated before transforms run
- `configPath` candidates for config-file migrations
- `configChanges` for config transforms and blockers
- `apiChanges` for glob-based source transforms and blockers

Each `packageVersionUpdates` entry defaults to the runner-level `from` and `to` values. Set entry-level `from` or `to` when the package range should be more specific than the displayed migration versions. Wildcard targets such as `4.x`, `4`, or `4.1.x` are resolved to the latest matching published package version before `package.json` is written.

### `runtime`

`runtime.node()`, `runtime.bun()`, and `runtime.deno()` create environment checks.

```ts
runtime.node({ version: ">=20.0.0" });
runtime.bun({ version: "^1.2.0" });
runtime.deno({ version: ">=2.0.0" });
```

Runtime checks can read project requirements from `package.json` fields such as `engines`, `volta`, `devEngines.runtime`, and runtime-specific `packageManager` pins. They also check version files such as `.nvmrc`, `.node-version`, `.bun-version`, `.deno-version`, and `.tool-versions` before falling back to the runtime command.

### `transformer`

`transformer.jscodeshift()` wraps a jscodeshift transform function and writes changed source back to disk.

```ts
transformer.jscodeshift((fileInfo, api) => {
  const j = api.jscodeshift;

  return j(fileInfo.source)
    .find(j.Identifier, { name: "oldName" })
    .replaceWith(() => j.identifier("newName"))
    .toSource();
});
```

`transformer.astGrep()` searches source with `ast-grep`. Without a replacement it returns `needs-review`; with a replacement it writes updated source.

```ts
transformer.astGrep({
  pattern: "oldValue()",
  replace: "newValue()",
});
```

## License

This package is licensed under MIT as declared in [`package.json`](package.json).
