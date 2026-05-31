import type { ApiChange } from "migration-kit";
import { environmentVariablePatterns } from "../patterns.js";
import { createTextTransform } from "../utils/text-transform.js";

const renameVitestEnvironmentVariables: ApiChange = {
  title: "Rename Vitest 4 environment variables",
  files: environmentVariablePatterns,
  transform: createTextTransform((source) =>
    source
      .replaceAll("VITEST_MAX_THREADS", "VITEST_MAX_WORKERS")
      .replaceAll("VITEST_MAX_FORKS", "VITEST_MAX_WORKERS")
      .replaceAll("VITE_NODE_DEPS_MODULE_DIRECTORIES", "VITEST_MODULE_DIRECTORIES"),
  ),
};

export { renameVitestEnvironmentVariables };
