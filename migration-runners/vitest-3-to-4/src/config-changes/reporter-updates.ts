import { transformer } from "migration-kit";
import type { ConfigChange, JscodeshiftCore } from "migration-kit";
import {
  getObjectPropertyName,
  isArrayExpression,
  isStringLiteral,
  isUnderObjectProperty,
  type NodePath,
} from "../utils/jscodeshift.js";

const reporterUpdatesChange: ConfigChange = {
  title: "Update Vitest 4 reporter config",
  description:
    "Rewrites the removed basic reporter to the equivalent default reporter with summary disabled.",
  policy: "advisory",
  transform: createReporterUpdatesTransform(),
};

function createReporterUpdatesTransform() {
  return transformer.jscodeshift((fileInfo, api) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath) => {
      if (
        !isUnderObjectProperty(path, "test") ||
        getObjectPropertyName(path.node) !== "reporters"
      ) {
        return;
      }

      const reporters = replaceBasicReporter(j, path.node.value);

      if (reporters) {
        path.node.value = reporters;
        changed = true;
      }
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function replaceBasicReporter(j: JscodeshiftCore, value: any): any | null {
  if (isStringLiteral(value) && value.value === "basic") {
    return j.arrayExpression([createDefaultReporter(j)]);
  }

  if (!isArrayExpression(value)) {
    return null;
  }

  let changed = false;

  value.elements = value.elements.map((element: any) => {
    if (isStringLiteral(element) && element.value === "basic") {
      changed = true;
      return createDefaultReporter(j);
    }

    if (
      isArrayExpression(element) &&
      isStringLiteral(element.elements[0]) &&
      element.elements[0].value === "basic"
    ) {
      element.elements[0].value = "default";
      ensureReporterSummaryFalse(j, element);
      changed = true;
    }

    return element;
  });

  return changed ? value : null;
}

function createDefaultReporter(j: JscodeshiftCore): any {
  return j.arrayExpression([
    j.stringLiteral("default"),
    j.objectExpression([j.objectProperty(j.identifier("summary"), j.booleanLiteral(false))]),
  ]);
}

function ensureReporterSummaryFalse(j: JscodeshiftCore, reporter: any) {
  const options = reporter.elements[1];

  if (!isObjectExpression(options)) {
    reporter.elements[1] = j.objectExpression([
      j.objectProperty(j.identifier("summary"), j.booleanLiteral(false)),
    ]);
    return;
  }

  const hasSummary = options.properties.some(
    (property: any) => getObjectPropertyName(property) === "summary",
  );

  if (!hasSummary) {
    options.properties.unshift(j.objectProperty(j.identifier("summary"), j.booleanLiteral(false)));
  }
}

function isObjectExpression(node: any): boolean {
  return node?.type === "ObjectExpression";
}

export { reporterUpdatesChange };
