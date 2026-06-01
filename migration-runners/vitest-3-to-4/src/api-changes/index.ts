import { moveTestOptions } from "./move-test-options.js";
import { preserveCoverageIgnoreComments } from "./preserve-coverage-ignore-comments.js";
import { renameVitestEnvironmentVariables } from "./rename-environment-variables.js";
import { reviewDependencyPackageChanges } from "./review-dependency-package-changes.js";
import { reviewSourceApiChanges } from "./review-source-api-changes.js";
import { updateBrowserContextImports } from "./update-browser-context-imports.js";
import { updateBrowserUtilsImports } from "./update-browser-utils-imports.js";
import { updateCustomEnvironment } from "./update-custom-environment.js";
import { updateDeprecatedTypeImports } from "./update-deprecated-type-imports.js";

const apiChanges = [
  reviewDependencyPackageChanges,
  renameVitestEnvironmentVariables,
  updateBrowserContextImports,
  updateBrowserUtilsImports,
  moveTestOptions,
  preserveCoverageIgnoreComments,
  updateCustomEnvironment,
  updateDeprecatedTypeImports,
  reviewSourceApiChanges,
];

export { apiChanges };
