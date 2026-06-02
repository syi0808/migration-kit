import { readMigrationFileSync, transformer } from "migration-kit";
import type { BlockCheckResult, ConfigChange, JscodeshiftCore, Transformer } from "migration-kit";
import {
  findObjectProperty,
  getObjectPropertyName,
  isObjectExpression,
  isStringLiteral,
  isUnderPropertyChain,
  parseSource,
  removeObjectProperty,
  type NodePath,
} from "../utils/jscodeshift.js";

const browserProviderChange: ConfigChange = {
  title: "Update browser provider config",
  description:
    "Moves browser.name/providerOptions into browser.instances and flags provider strings that need provider factories.",
  policy: "blocking",
  transform: createBrowserProviderTransform(),
  shouldBlock: browserProviderReviewBlocker,
};

function createBrowserProviderTransform(): Transformer {
  return transformer.jscodeshift((fileInfo, api): string => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath): void => {
      if (getObjectPropertyName(path.node) !== "browser" || !isUnderPropertyChain(path, ["test"])) {
        return;
      }

      changed = moveBrowserNameToInstances(j, path.node.value) || changed;
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function moveBrowserNameToInstances(j: JscodeshiftCore, browserObject: any): boolean {
  if (!isObjectExpression(browserObject) || findObjectProperty(browserObject, "instances")) {
    return false;
  }

  const nameProperty = findObjectProperty(browserObject, "name");

  if (!nameProperty) {
    return false;
  }

  const instanceProperties = [j.objectProperty(j.identifier("browser"), nameProperty.value)];
  const providerOptions = findObjectProperty(browserObject, "providerOptions");

  if (providerOptions && !isObjectExpression(providerOptions.value)) {
    return false;
  }

  if (providerOptions) {
    if (findObjectProperty(providerOptions.value, "browser")) {
      return false;
    }

    instanceProperties.push(...providerOptions.value.properties);
    removeObjectProperty(browserObject, providerOptions);
  }

  removeObjectProperty(browserObject, nameProperty);
  browserObject.properties.push(
    j.objectProperty(
      j.identifier("instances"),
      j.arrayExpression([j.objectExpression(instanceProperties)]),
    ),
  );

  return true;
}

function browserProviderReviewBlocker(filePath: string): BlockCheckResult {
  const source = readMigrationFileSync(filePath);

  if (hasBrowserProviderFindings(filePath, source)) {
    return {
      reason: "browser provider config changed; use provider factories and browser.instances.",
    };
  }

  return false;
}

function hasBrowserProviderFindings(filePath: string, source: string): boolean {
  const { j, root } = parseSource(filePath, source);
  let found = false;

  root.find(j.ObjectProperty).forEach((path: NodePath): void => {
    if (getObjectPropertyName(path.node) !== "browser" || !isUnderPropertyChain(path, ["test"])) {
      return;
    }

    if (!isObjectExpression(path.node.value)) {
      return;
    }

    const provider = findObjectProperty(path.node.value, "provider");

    if (provider && isStringLiteral(provider.value)) {
      found = true;
    }

    if (
      findObjectProperty(path.node.value, "name") ||
      findObjectProperty(path.node.value, "providerOptions")
    ) {
      found = true;
    }
  });

  return found;
}

export { browserProviderChange };
