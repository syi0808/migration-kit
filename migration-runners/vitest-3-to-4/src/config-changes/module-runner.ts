import { readFileSync } from "node:fs";
import { transformer } from "migration-kit";
import type { ConfigChange } from "migration-kit";
import {
  getObjectPropertyName,
  isUnderPropertyChain,
  setObjectPropertyName,
  type NodePath,
} from "../utils/jscodeshift.js";

const moduleRunnerConfigChange: ConfigChange = {
  title: "Update Module Runner config",
  description:
    "Renames deps.optimizer.web to deps.optimizer.client and flags old dependency externalization options.",
  policy: "advisory",
  transform: createModuleRunnerConfigTransform(),
  shouldBlock: moduleRunnerConfigReviewBlocker,
};

function createModuleRunnerConfigTransform() {
  return transformer.jscodeshift((fileInfo, api) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath) => {
      const propertyName = getObjectPropertyName(path.node);

      if (propertyName !== "web" || !isUnderPropertyChain(path, ["optimizer", "deps", "test"])) {
        return;
      }

      setObjectPropertyName(j, path.node, "client");
      changed = true;
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function moduleRunnerConfigReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const reasons: string[] = [];

  if (/\bdeps\s*:\s*{[\s\S]*?\b(external|inline|fallbackCJS)\s*:/.test(source)) {
    reasons.push("deps.external/deps.inline/deps.fallbackCJS moved under server.deps.");
  }

  if (reasons.length === 0) {
    return false;
  }

  return { reason: reasons.join(" ") };
}

export { moduleRunnerConfigChange };
