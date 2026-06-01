# Vitest 3 Mixed Fixture

This fixture is a synthetic Vitest 3 project for exercising `migration-runners/vitest-3-to-4`.
It intentionally includes config migrations, API migrations, package review prompts, environment
variable renames, and source review blockers.

## Run

From the repository root:

```sh
pnpm build
pnpm --dir migration-runners/vitest-3-to-4 build
cd migration-runners/vitest-3-to-4/fixtures/vitest-v3-mixed
npm run migrate:vitest4
```

The default script runs the migration against a temporary copy and prints that path before starting.
The fixture includes `fake-bin/pnpm` so the migration can test the package-manager install step
without installing dependencies into the mock project. The package version resolver still contacts
the npm registry to resolve `4.x` targets.

## Expected Flow

The runner should:

1. Update Vitest family package ranges from `3.x` to `4.x`.
2. Rewrite config options in `vitest.config.ts`.
3. Ask for manual confirmation for `restoreMocks`.
4. Ask for manual confirmation for direct `vite-node` usage.
5. Rename legacy Vitest environment variables.
6. Rewrite browser context imports, test option argument order, and coverage ignore comments.
7. Stop on source review blockers in `src/mixed-api.fixture.ts`, `test/custom-environment.ts`, and
   `vitest.setup.ts`.
