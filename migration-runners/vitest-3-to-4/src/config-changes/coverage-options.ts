import { readFileSync } from "node:fs";
import { transformer } from "migration-kit";
import type { ConfigChange } from "migration-kit";
import {
  getObjectPropertyName,
  isUnderObjectProperty,
  type NodePath,
} from "../utils/jscodeshift.js";

const coverageOptionsChange: ConfigChange = {
  title: "Update Vitest 4 coverage options",
  description:
    "Removes coverage.all, coverage.extensions, coverage.ignoreEmptyLines, and coverage.experimentalAstAwareRemapping. Flags coverage configs that still need an explicit include pattern.",
  policy: "advisory",
  transform: createCoverageOptionsTransform(),
  shouldBlock: coverageOptionsReviewBlocker,
};

function createCoverageOptionsTransform() {
  return transformer.jscodeshift((fileInfo, api) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath) => {
      const propertyName = getObjectPropertyName(path.node);

      if (!propertyName || !isRemovedCoverageOption(path, propertyName)) {
        return;
      }

      (j as any)(path).remove();
      changed = true;
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function coverageOptionsReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");

  if (/\bcoverage\s*:\s*{/.test(source) && !/\binclude\s*:/.test(source)) {
    return {
      reason:
        "coverage.include is not defined; Vitest 4 reports only loaded files unless include is configured.",
    };
  }

  return false;
}

function isRemovedCoverageOption(path: NodePath, propertyName: string): boolean {
  return (
    isUnderObjectProperty(path, "coverage") &&
    isUnderObjectProperty(path, "test") &&
    (propertyName === "all" ||
      propertyName === "extensions" ||
      propertyName === "ignoreEmptyLines" ||
      propertyName === "experimentalAstAwareRemapping")
  );
}

export { coverageOptionsChange };
