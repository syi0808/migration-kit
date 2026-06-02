import { readMigrationFileSync, transformer } from "migration-kit";
import type { BlockCheckResult, ConfigChange, JscodeshiftCore, Transformer } from "migration-kit";
import {
  findObjectProperty,
  getObjectPropertyName,
  isBooleanLiteral,
  isNumericLiteral,
  isObjectExpression,
  isUnderPropertyChain,
  parseSource,
  removeObjectProperty,
  setObjectPropertyName,
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
  transform: createPoolReworkTransform(),
  shouldBlock: poolReworkReviewBlocker,
};

function createPoolReworkTransform(): Transformer {
  return transformer.jscodeshift((fileInfo, api): string => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath): void => {
      if (!isUnderPropertyChain(path, ["test"])) {
        return;
      }

      const propertyName = getObjectPropertyName(path.node);

      if (propertyName === "maxThreads" || propertyName === "maxForks") {
        changed = renameToAvailableProperty(j, path, "maxWorkers") || changed;
        return;
      }

      if (propertyName && removedPoolOptions.has(propertyName)) {
        (j as any)(path).remove();
        changed = true;
        return;
      }

      if (propertyName && singleWorkerOptions.has(propertyName)) {
        changed = replaceSingleWorkerOption(j, path) || changed;
        return;
      }

      if (propertyName === "poolOptions") {
        changed = flattenPoolOptions(j, path) || changed;
      }
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function flattenPoolOptions(j: JscodeshiftCore, path: NodePath): boolean {
  const poolOptions = path.node.value;
  const testObject = path.parent?.node;

  if (!isObjectExpression(poolOptions) || !isObjectExpression(testObject)) {
    return false;
  }

  let changed = false;

  for (const poolProperty of [...poolOptions.properties]) {
    const poolName = getObjectPropertyName(poolProperty);

    if (!poolName || !poolOptionGroups.has(poolName) || !isObjectExpression(poolProperty.value)) {
      continue;
    }

    const poolObject = poolProperty.value;

    for (const option of [...poolObject.properties]) {
      const optionName = getObjectPropertyName(option);

      if (!optionName) {
        continue;
      }

      if (removedPoolOptions.has(optionName)) {
        removeObjectProperty(poolObject, option);
        changed = true;
        continue;
      }

      if (singleWorkerOptions.has(optionName)) {
        changed = replaceNestedSingleWorkerOption(j, testObject, poolObject, option) || changed;
        continue;
      }

      const targetName = getFlattenedPoolOptionName(poolName, optionName);

      if (findObjectProperty(testObject, targetName)) {
        continue;
      }

      removeObjectProperty(poolObject, option);
      setObjectPropertyName(j, option, targetName);
      testObject.properties.push(option);
      changed = true;
    }

    if (poolObject.properties.length === 0) {
      removeObjectProperty(poolOptions, poolProperty);
      changed = true;
    }
  }

  if (changed && poolOptions.properties.length === 0) {
    removeObjectProperty(testObject, path.node);
  }

  return changed;
}

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

function renameToAvailableProperty(
  j: JscodeshiftCore,
  path: NodePath,
  targetName: string,
): boolean {
  const object = path.parent?.node;
  const existing = findObjectProperty(object, targetName);

  if (existing && existing !== path.node) {
    return false;
  }

  setObjectPropertyName(j, path.node, targetName);

  return true;
}

function replaceNestedSingleWorkerOption(
  j: JscodeshiftCore,
  testObject: any,
  poolObject: any,
  option: any,
): boolean {
  if (!isBooleanLiteral(option.value)) {
    return false;
  }

  if (option.value.value === false) {
    removeObjectProperty(poolObject, option);
    return true;
  }

  if (!ensureSingleWorkerSettings(j, testObject)) {
    return false;
  }

  removeObjectProperty(poolObject, option);

  return true;
}

function replaceSingleWorkerOption(j: JscodeshiftCore, path: NodePath): boolean {
  const testObject = path.parent?.node;

  if (!isObjectExpression(testObject) || !isBooleanLiteral(path.node.value)) {
    return false;
  }

  if (path.node.value.value === false) {
    removeObjectProperty(testObject, path.node);
    return true;
  }

  if (!ensureSingleWorkerSettings(j, testObject)) {
    return false;
  }

  removeObjectProperty(testObject, path.node);

  return true;
}

function ensureSingleWorkerSettings(j: JscodeshiftCore, testObject: any): boolean {
  const maxWorkers = findObjectProperty(testObject, "maxWorkers");
  const isolate = findObjectProperty(testObject, "isolate");

  if (maxWorkers && !isNumberValue(maxWorkers.value, 1)) {
    return false;
  }

  if (isolate && !isBooleanValue(isolate.value, false)) {
    return false;
  }

  if (!maxWorkers) {
    testObject.properties.push(j.objectProperty(j.identifier("maxWorkers"), j.numericLiteral(1)));
  }

  if (!isolate) {
    testObject.properties.push(j.objectProperty(j.identifier("isolate"), j.booleanLiteral(false)));
  }

  return true;
}

function isNumberValue(node: any, value: number): boolean {
  return isNumericLiteral(node) && node.value === value;
}

function isBooleanValue(node: any, value: boolean): boolean {
  return isBooleanLiteral(node) && node.value === value;
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
