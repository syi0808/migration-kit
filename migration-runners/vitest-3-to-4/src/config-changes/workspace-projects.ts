import { readFileSync } from "node:fs";
import { transformer } from "migration-kit";
import type { ConfigChange } from "migration-kit";
import {
  getObjectPropertyName,
  isStringLiteral,
  isUnderObjectProperty,
  setObjectPropertyName,
  type NodePath,
} from "../utils/jscodeshift.js";

const workspaceProjectsChange: ConfigChange = {
  title: "Replace workspace config with projects",
  description:
    "Renames inline test.workspace project definitions to test.projects and flags workspace files that must be merged into the main config.",
  policy: "advisory",
  transform: createWorkspaceProjectsTransform(),
  shouldBlock: workspaceProjectsReviewBlocker,
};

function createWorkspaceProjectsTransform() {
  return transformer.jscodeshift((fileInfo, api) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.ObjectProperty).forEach((path: NodePath) => {
      if (!isUnderObjectProperty(path, "test")) {
        return;
      }

      if (getObjectPropertyName(path.node) !== "workspace" || isStringLiteral(path.node.value)) {
        return;
      }

      setObjectPropertyName(j, path.node, "projects");
      changed = true;
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function workspaceProjectsReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");

  if (/\bworkspace\s*:\s*['"][^'"]*vitest\.workspace\.[^'"]*['"]/.test(source)) {
    return {
      reason:
        "test.workspace points at a workspace file; move that file's project array into test.projects.",
    };
  }

  return false;
}

export { workspaceProjectsChange };
