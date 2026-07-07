import { readMigrationFileSync, transformer } from "migration-kit";
import type { BlockCheckResult, ConfigChange } from "migration-kit";
import type { ObjectEditor, ObjectEntry } from "comorph";
import { object } from "comorph";
import { vitestConfigCodemod } from "../utils/comorph.js";
import {
  getObjectPropertyName,
  isUnderPropertyChain,
  parseSource,
  type NodePath,
} from "../utils/jscodeshift.js";

const poolOptionGroups = new Set(["threads", "forks", "vmThreads", "vmForks"]);
const removedPoolOptions = new Set(["minWorkers", "useAtomic", "useAtomics"]);
const singleWorkerOptions = new Set(["singleThread", "singleFork"]);

const poolReworkChange: ConfigChange = {
  title: "Update Vitest 4 pool options",
  description:
    "Renames maxThreads/maxForks to maxWorkers, flattens safe poolOptions, removes deleted pool options, and flags ambiguous pool cases.",
  policy: "blocking",
  transform: transformer.comorph(
    vitestConfigCodemod("vitest-4-pool-rework", (config) => {
      rewriteTopLevelPoolOptions(config);
      flattenPoolOptions(config);
    }),
  ),
  shouldBlock: poolReworkReviewBlocker,
};

function getFlattenedPoolOptionName(poolName: string, optionName: string): string {
  if (poolName === "vmThreads" || poolName === "vmForks") {
    if (optionName === "memoryLimit") {
      return "vmMemoryLimit";
    }
  }

  if (optionName === "maxThreads" || optionName === "maxForks") {
    return "maxWorkers";
  }

  return optionName;
}

function rewriteTopLevelPoolOptions(config: ObjectEditor): void {
  for (const source of ["maxThreads", "maxForks"]) {
    if (config.has("test.maxWorkers").kind === "yes") {
      continue;
    }

    const value = config.take(`test.${source}`);

    if (value.kind === "value") {
      config.set("test.maxWorkers", value);
    }
  }

  for (const option of removedPoolOptions) {
    config.remove(`test.${option}`);
  }

  for (const option of singleWorkerOptions) {
    const value = config.get(`test.${option}`);

    if (value.kind !== "value") {
      continue;
    }

    const text = value.value().text().trim();

    if (text === "false" || (text === "true" && ensureSingleWorkerSettings(config))) {
      config.remove(`test.${option}`);
    }
  }
}

function flattenPoolOptions(config: ObjectEditor): void {
  const poolOptions = config.entries("test.poolOptions");

  if (poolOptions.kind !== "value") {
    return;
  }

  const handledPools: ObjectEntry[] = [];
  const handledOptionsByPool = new Map<ObjectEntry, ObjectEntry[]>();
  let hasRemainingPoolOption = false;

  for (const pool of poolOptions.valueOrFail()) {
    if (!poolOptionGroups.has(pool.key) || pool.value.kind() !== "ObjectExpression") {
      hasRemainingPoolOption = true;
      continue;
    }

    const poolEntries = object(pool.value).entries();

    if (poolEntries.kind !== "value") {
      hasRemainingPoolOption = true;
      continue;
    }

    const handledOptions: ObjectEntry[] = [];

    for (const option of poolEntries.valueOrFail()) {
      if (rewriteNestedPoolOption(config, pool.key, option)) {
        handledOptions.push(option);
      } else {
        hasRemainingPoolOption = true;
      }
    }

    if (handledOptions.length === poolEntries.valueOrFail().length) {
      handledPools.push(pool);
    } else if (handledOptions.length > 0) {
      handledOptionsByPool.set(pool, handledOptions);
    }
  }

  if (!hasRemainingPoolOption) {
    config.remove("test.poolOptions");
    return;
  }

  for (const pool of handledPools) {
    pool.property.remove();
  }

  for (const [pool, options] of handledOptionsByPool) {
    const poolObject = object(pool.value);

    for (const option of options) {
      poolObject.remove(option.key);
    }
  }
}

function rewriteNestedPoolOption(
  config: ObjectEditor,
  poolName: string,
  option: ObjectEntry,
): boolean {
  if (removedPoolOptions.has(option.key)) {
    return true;
  }

  if (singleWorkerOptions.has(option.key)) {
    const text = option.value.text().trim();

    if (text === "false" || (text === "true" && ensureSingleWorkerSettings(config))) {
      return true;
    }

    return false;
  }

  const targetName = getFlattenedPoolOptionName(poolName, option.key);

  if (config.has(`test.${targetName}`).kind === "yes") {
    return false;
  }

  config.set(`test.${targetName}`, option.value);

  return true;
}

function ensureSingleWorkerSettings(config: ObjectEditor): boolean {
  const maxWorkers = config.get("test.maxWorkers");
  const isolate = config.get("test.isolate");

  if (maxWorkers.kind === "value" && maxWorkers.value().text().trim() !== "1") {
    return false;
  }

  if (isolate.kind === "value" && isolate.value().text().trim() !== "false") {
    return false;
  }

  if (maxWorkers.kind === "missing") {
    config.set("test.maxWorkers", 1);
  }

  if (isolate.kind === "missing") {
    config.set("test.isolate", false);
  }

  return true;
}

function poolReworkReviewBlocker(filePath: string): BlockCheckResult {
  const source = readMigrationFileSync(filePath);
  const reasons: string[] = [];

  addIf(
    reasons,
    hasImmediateTestProperty(filePath, source, "poolOptions"),
    "poolOptions was removed; move pool options to the top level of test config.",
  );
  addIf(
    reasons,
    hasImmediateTestProperty(filePath, source, "maxThreads") ||
      hasImmediateTestProperty(filePath, source, "maxForks") ||
      hasImmediateTestProperty(filePath, source, "minWorkers") ||
      hasImmediateTestProperty(filePath, source, "useAtomic") ||
      hasImmediateTestProperty(filePath, source, "useAtomics"),
    "maxThreads/maxForks/minWorkers/useAtomics were removed; use maxWorkers and remove deleted pool options.",
  );
  addIf(
    reasons,
    hasImmediateTestProperty(filePath, source, "singleThread") ||
      hasImmediateTestProperty(filePath, source, "singleFork"),
    "singleThread/singleFork were removed; use maxWorkers: 1 with isolate: false where needed.",
  );
  addIf(
    reasons,
    hasNestedRemovedPoolOption(filePath, source),
    "useAtomics/useAtomic was removed from pool options.",
  );

  if (reasons.length === 0) {
    return false;
  }

  return { reason: reasons.join(" ") };
}

function addIf(reasons: string[], condition: boolean, reason: string): void {
  if (condition) {
    reasons.push(reason);
  }
}

function hasImmediateTestProperty(filePath: string, source: string, name: string): boolean {
  const { j, root } = parseSource(filePath, source);
  let found = false;

  root.find(j.ObjectProperty).forEach((path: NodePath): void => {
    if (getObjectPropertyName(path.node) === name && isUnderPropertyChain(path, ["test"])) {
      found = true;
    }
  });

  return found;
}

function hasNestedRemovedPoolOption(filePath: string, source: string): boolean {
  const { j, root } = parseSource(filePath, source);
  let found = false;

  root.find(j.ObjectProperty).forEach((path: NodePath): void => {
    const propertyName = getObjectPropertyName(path.node);

    if (propertyName && removedPoolOptions.has(propertyName) && isUnderPoolOptionGroup(path)) {
      found = true;
    }
  });

  return found;
}

function isUnderPoolOptionGroup(path: NodePath): boolean {
  for (const poolName of poolOptionGroups) {
    if (
      isUnderPropertyChain(path, [poolName, "poolOptions", "test"]) ||
      isUnderPropertyChain(path, [poolName, "test"])
    ) {
      return true;
    }
  }

  return false;
}

export { poolReworkChange };
