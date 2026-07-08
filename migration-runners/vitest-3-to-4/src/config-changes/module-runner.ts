import { readMigrationFileSync, transformer } from "migration-kit";
import type { BlockCheckResult, ConfigChange, Transformer, TransformResult } from "migration-kit";
import { vitestConfigCodemod } from "../utils/comorph.js";
import { hasObjectPropertyPathWhere } from "../utils/comorph-query.js";

const movedServerDepOptions = new Set(["external", "inline", "fallbackCJS"]);

const moduleRunnerConfigChange: ConfigChange = {
  title: "Update Module Runner config",
  description:
    "Renames deps.optimizer.web to deps.optimizer.client and moves dependency externalization options under server.deps.",
  policy: "blocking",
  transform: sequenceTransforms(
    transformer.comorph(
      vitestConfigCodemod("vitest-4-module-runner-optimizer", (config) => {
        config.rename("test.deps.optimizer.web", "client");
      }),
    ),
    transformer.comorph(
      vitestConfigCodemod("vitest-4-module-runner-server-deps", (config) => {
        for (const option of movedServerDepOptions) {
          if (config.has(`test.server.deps.${option}`).kind === "yes") {
            continue;
          }

          const value = config.take(`test.deps.${option}`);

          if (value.kind === "value") {
            config.set(`test.server.deps.${option}`, value);
          }
        }
      }),
    ),
  ),
  shouldBlock: moduleRunnerConfigReviewBlocker,
};

function sequenceTransforms(...transforms: Transformer[]): Transformer {
  return async (filePath: string): Promise<TransformResult> => {
    let updated = false;

    for (const transform of transforms) {
      const result = await transform(filePath);

      if (result.status === "failed" || result.status === "needs-review") {
        return result;
      }

      updated ||= result.status === "updated";
    }

    return { status: updated ? "updated" : "unchanged", filePath };
  };
}

function moduleRunnerConfigReviewBlocker(filePath: string): BlockCheckResult {
  const source = readMigrationFileSync(filePath);

  if (!hasLegacyServerDepOptions(filePath, source)) {
    return false;
  }

  return { reason: "deps.external/deps.inline/deps.fallbackCJS moved under server.deps." };
}

function hasLegacyServerDepOptions(filePath: string, source: string): boolean {
  return hasObjectPropertyPathWhere(
    source,
    filePath,
    (path) =>
      path.length === 3 &&
      path[0] === "test" &&
      path[1] === "deps" &&
      movedServerDepOptions.has(path[2] ?? ""),
  );
}

export { moduleRunnerConfigChange };
