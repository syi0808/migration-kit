import { readFileSync } from "node:fs";
import { transformer } from "migration-kit";
import type { ConfigChange } from "migration-kit";
import {
  getObjectPropertyName,
  isUnderObjectProperty,
  setObjectPropertyName,
  type NodePath,
} from "../utils/jscodeshift.js";

const poolReworkChange: ConfigChange = {
  title: "Update Vitest 4 pool options",
  description:
    "Renames maxThreads/maxForks to maxWorkers, removes minWorkers, and flags poolOptions cases that need project-specific migration.",
  policy: "advisory",
  transform: createPoolReworkTransform(),
  shouldBlock: poolReworkReviewBlocker,
};

function createPoolReworkTransform() {
  return transformer.jscodeshift((fileInfo, api) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath) => {
      if (!isUnderObjectProperty(path, "test")) {
        return;
      }

      const propertyName = getObjectPropertyName(path.node);

      if (propertyName === "maxThreads" || propertyName === "maxForks") {
        setObjectPropertyName(j, path.node, "maxWorkers");
        changed = true;
        return;
      }

      if (propertyName === "minWorkers") {
        (j as any)(path).remove();
        changed = true;
      }
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function poolReworkReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const reasons: string[] = [];

  addIf(
    reasons,
    /\bpoolOptions\s*:/.test(source),
    "poolOptions was removed; move pool options to the top level of test config.",
  );
  addIf(
    reasons,
    /\b(singleThread|singleFork)\s*:/.test(source),
    "singleThread/singleFork were removed; use maxWorkers: 1 with isolate: false where needed.",
  );
  addIf(
    reasons,
    /\bthreads\s*:\s*{[\s\S]*?\buseAtomics\s*:/.test(source),
    "threads.useAtomics was removed.",
  );

  if (reasons.length === 0) {
    return false;
  }

  return { reason: reasons.join(" ") };
}

function addIf(reasons: string[], condition: boolean, reason: string) {
  if (condition) {
    reasons.push(reason);
  }
}

export { poolReworkChange };
