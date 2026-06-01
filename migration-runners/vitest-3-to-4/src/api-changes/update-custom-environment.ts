import { transformer } from "migration-kit";
import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import {
  findObjectProperty,
  getObjectPropertyName,
  isObjectExpression,
  isStringLiteral,
  removeObjectProperty,
  setObjectPropertyName,
  type NodePath,
} from "../utils/jscodeshift.js";

const updateCustomEnvironment: ApiChange = {
  title: "Update custom environment transform mode",
  description:
    "Rewrites custom environment transformMode to Vitest 4 viteEnvironment when the value is known.",
  files: sourceFilePatterns,
  transform: createCustomEnvironmentTransform(),
};

function createCustomEnvironmentTransform() {
  return transformer.jscodeshift((fileInfo, api) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath) => {
      if (getObjectPropertyName(path.node) !== "transformMode") {
        return;
      }

      const parent = path.parent?.node;

      if (!isObjectExpression(parent)) {
        return;
      }

      if (findObjectProperty(parent, "viteEnvironment")) {
        changed = removeObjectProperty(parent, path.node) || changed;
        return;
      }

      if (!isStringLiteral(path.node.value)) {
        return;
      }

      const viteEnvironment = getViteEnvironmentValue(path.node.value.value);

      if (!viteEnvironment) {
        return;
      }

      setObjectPropertyName(j, path.node, "viteEnvironment");
      path.node.value.value = viteEnvironment;
      changed = true;
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function getViteEnvironmentValue(transformMode: string): string | null {
  if (transformMode === "ssr") {
    return "ssr";
  }

  if (transformMode === "web") {
    return "client";
  }

  return null;
}

export { createCustomEnvironmentTransform, updateCustomEnvironment };
