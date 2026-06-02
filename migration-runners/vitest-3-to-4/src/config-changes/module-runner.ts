import { readMigrationFileSync, transformer } from "migration-kit";
import type { BlockCheckResult, ConfigChange, JscodeshiftCore, Transformer } from "migration-kit";
import {
  ensureObjectProperty,
  findObjectProperty,
  getObjectPropertyName,
  isObjectExpression,
  isUnderPropertyChain,
  parseSource,
  removeObjectProperty,
  setObjectPropertyName,
  type NodePath,
} from "../utils/jscodeshift.js";

const movedServerDepOptions = new Set(["external", "inline", "fallbackCJS"]);

const moduleRunnerConfigChange: ConfigChange = {
  title: "Update Module Runner config",
  description:
    "Renames deps.optimizer.web to deps.optimizer.client and moves dependency externalization options under server.deps.",
  policy: "blocking",
  transform: createModuleRunnerConfigTransform(),
  shouldBlock: moduleRunnerConfigReviewBlocker,
};

function createModuleRunnerConfigTransform(): Transformer {
  return transformer.jscodeshift((fileInfo, api): string => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath): void => {
      const propertyName = getObjectPropertyName(path.node);

      if (propertyName === "web" && isUnderPropertyChain(path, ["optimizer", "deps", "test"])) {
        setObjectPropertyName(j, path.node, "client");
        changed = true;
        return;
      }

      if (propertyName === "deps" && isUnderPropertyChain(path, ["test"])) {
        changed = moveServerDeps(j, path) || changed;
      }
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function moveServerDeps(j: JscodeshiftCore, path: NodePath): boolean {
  const depsObject = path.node.value;
  const testObject = path.parent?.node;

  if (!isObjectExpression(depsObject) || !isObjectExpression(testObject)) {
    return false;
  }

  const serverOptions = depsObject.properties.filter((property: any): boolean => {
    const propertyName = getObjectPropertyName(property);

    return propertyName ? movedServerDepOptions.has(propertyName) : false;
  });

  if (serverOptions.length === 0) {
    return false;
  }

  const serverObject = ensureObjectProperty(j, testObject, "server");
  const serverDepsObject = ensureObjectProperty(j, serverObject, "deps");

  if (!serverDepsObject) {
    return false;
  }

  let changed = false;

  for (const property of serverOptions) {
    const propertyName = getObjectPropertyName(property);

    if (!propertyName || findObjectProperty(serverDepsObject, propertyName)) {
      continue;
    }

    removeObjectProperty(depsObject, property);
    serverDepsObject.properties.push(property);
    changed = true;
  }

  if (changed && depsObject.properties.length === 0) {
    removeObjectProperty(testObject, path.node);
  }

  return changed;
}

function moduleRunnerConfigReviewBlocker(filePath: string): BlockCheckResult {
  const source = readMigrationFileSync(filePath);

  if (!hasLegacyServerDepOptions(filePath, source)) {
    return false;
  }

  return { reason: "deps.external/deps.inline/deps.fallbackCJS moved under server.deps." };
}

function hasLegacyServerDepOptions(filePath: string, source: string): boolean {
  const { j, root } = parseSource(filePath, source);
  let found = false;

  root.find(j.ObjectProperty).forEach((path: NodePath): void => {
    const propertyName = getObjectPropertyName(path.node);

    if (
      propertyName &&
      movedServerDepOptions.has(propertyName) &&
      isUnderPropertyChain(path, ["deps", "test"])
    ) {
      found = true;
    }
  });

  return found;
}

export { moduleRunnerConfigChange };
