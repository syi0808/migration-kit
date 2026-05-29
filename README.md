```
// Example

import {
    createMigrationRunner,
    runtime, // runtime.node, runtime.bun, runtime.deno
    transformer, // transformer.astGrep, transformer.jscodeshift
} from 'migration-kit';

const migrationRunner = createMigrationRunner({
    name: "Vitest Migration",
    from: "^3",
    to: "^4",
    docs: "https://...",
    configPath: [],
    environment: [
        runtime.node({ // Check internally corepack, nvm, volta, etc... or Execute node -v
            version:  ">=20.0.0"
        }),
    ],
    peerDependencies: [ // Check process.cwd() + package.json or Check lock file like yarn.lock. I don't think correct thing.
        {
            dependency: "vite",
            requiredVersion: ">=6.0.0",
        },
    ],
    configChanges: [
        {
            title: "Removed Options coverage.all and coverage.extensions",
            description: "",
            level: "error",
            shouldBlock: (filePath: string) => {
                if() return false;

                return {
                    reason: "In vitest.config.ts, Replace test.coverage.all, test.coverage.extensions with test.coverage.include/exclude",
                };
            },
            transform: (filePath: string): TransformedCode => {
                Remove test.coverage.all
                Remove test.coverage.extensions
            },
        },
    ],
    apiChanges: [
        {
            title: "spyOn and fn Support Constructors",
            level: "error",
            files: ['*.test.ts'],
            transform: transformer.jscodeshift((fileInfo, ...) => {
                Replace arrow fn with function expression when passed to mockImplementation
            }),
        },
    ],
});

migrationRunner.run();

===

# CLI preview

$ npx @vitest/codemod-v3-to-v4

Vitest Migration v3 -> v4
Docs: ...

Environment
  ✗ node >=20 required, current 18.19.0

Dependencies
  ✓ vite >=6.0.0

Config Changes
  Removed Options coverage.all and coverage.extensions
    ✗ Blocked
      In vitest.config.ts, Replace test.coverage.all, test.coverage.extensions with test.converage.include/exclude // It refreshes and checks again when config file changed

  Removed Options coverage.all and coverage.extensions
    ✓ Updated

API Changes
  mockImplementation arrow functions may be constructor mocks
    1 auto-fixed
    2 need review

  mockImplementation arrow functions may be constructor mocks
    [=====--------------] 40%

===

Flow

Environment Check (if requirement is not met, just warn)
-> Dependencies Check (if required thing not correct, exit the process)
-> Config Changes Check
    -> Run transform fn
        -> Prompt user for confirm continue
        -> Find config file
        -> Run transformer
    -> Run block fn (if returned true, Pause CLI and notify the user)
-> API Changes Check
    -> Run transform fn
        -> Prompt user for confirm continue
        -> Scan files
        -> Run transformer (with counting)
    -> Run block fn
```
