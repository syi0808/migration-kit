export { createMigrationRunner } from "./migration-runner.js";
export { readMigrationFileSync } from "./migration-runtime.js";
export { runtime } from "./runtime-checker/runtime.js";
export { transformer } from "./transformer/transformer.js";
export type { AstGrepMatch, AstGrepOptions, AstGrepReplacement } from "./transformer/ast-grep.js";
export { parseJscodeshiftSourceForScan } from "./transformer/jscodeshift.js";
export type {
  JscodeshiftApi,
  JscodeshiftCore,
  JscodeshiftFileInfo,
  JscodeshiftOptions,
  JscodeshiftParseOptions,
  JscodeshiftParseResult,
  JscodeshiftParser,
  JscodeshiftTransform,
} from "./transformer/jscodeshift.js";
export type {
  ApiChange,
  BlockCheckResult,
  BlockFinding,
  BlockKind,
  ManualConfirmationBlock,
  ManualFixBlock,
  ConfigChange,
  EnvironmentRequirementCheck,
  MigrationRunnerOptions,
  PackageVersionUpdate,
  PeerDependency,
  Transformer,
  TransformResult,
} from "./types.js";
