import { readMigrationFileSync, transformer } from "migration-kit";
import type { BlockCheckResult, ConfigChange } from "migration-kit";
import { vitestConfigCodemod } from "../utils/comorph.js";

const removedCoverageOptions = new Set([
  "all",
  "extensions",
  "ignoreEmptyLines",
  "experimentalAstAwareRemapping",
]);

const coverageOptionsChange: ConfigChange = {
  title: "Update Vitest 4 coverage options",
  description:
    "Removes coverage.all, coverage.extensions, coverage.ignoreEmptyLines, and coverage.experimentalAstAwareRemapping. Flags coverage configs that still need an explicit include pattern.",
  policy: "blocking",
  transform: transformer.comorph(
    vitestConfigCodemod("vitest-4-coverage-options", (config) => {
      for (const option of removedCoverageOptions) {
        config.remove(`test.coverage.${option}`);
      }
    }),
  ),
  shouldBlock: coverageOptionsReviewBlocker,
};

function coverageOptionsReviewBlocker(filePath: string): BlockCheckResult {
  const source = readMigrationFileSync(filePath);

  if (/\bcoverage\s*:\s*{/.test(source) && !/\binclude\s*:/.test(source)) {
    return {
      kind: "manual-confirmation" as const,
      reason:
        "coverage.include is not defined; Vitest 4 reports only loaded files unless include is configured.",
      prompt: "Confirm coverage.include is intentionally omitted, or add it before continuing.",
    };
  }

  return false;
}

export { coverageOptionsChange };
