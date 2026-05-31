import { moveTestOptions } from "./move-test-options.js";
import { preserveCoverageIgnoreComments } from "./preserve-coverage-ignore-comments.js";
import { renameVitestEnvironmentVariables } from "./rename-environment-variables.js";
import { reviewDependencyPackageChanges } from "./review-dependency-package-changes.js";
import { reviewSourceApiChanges } from "./review-source-api-changes.js";
import { updateBrowserContextImports } from "./update-browser-context-imports.js";

const apiChanges = [
  reviewDependencyPackageChanges,
  renameVitestEnvironmentVariables,
  updateBrowserContextImports,
  moveTestOptions,
  preserveCoverageIgnoreComments,
  reviewSourceApiChanges,
];

export { apiChanges };
