import { browserProviderChange } from "./browser-provider.js";
import { coverageOptionsChange } from "./coverage-options.js";
import { deprecatedConfigChange } from "./deprecated-config.js";
import { moduleRunnerConfigChange } from "./module-runner.js";
import { poolReworkChange } from "./pool-rework.js";
import { reporterUpdatesChange } from "./reporter-updates.js";
import { workspaceProjectsChange } from "./workspace-projects.js";

const configChanges = [
  coverageOptionsChange,
  moduleRunnerConfigChange,
  workspaceProjectsChange,
  browserProviderChange,
  poolReworkChange,
  reporterUpdatesChange,
  deprecatedConfigChange,
];

export { configChanges };
