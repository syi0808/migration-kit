import { readMigrationFileSync, transformer } from "migration-kit";
import type { BlockCheckResult, ConfigChange } from "migration-kit";
import { vitestConfigCodemod } from "../utils/comorph.js";

const workspaceProjectsChange: ConfigChange = {
  title: "Replace workspace config with projects",
  description:
    "Renames inline test.workspace project definitions to test.projects and flags workspace files that must be merged into the main config.",
  policy: "blocking",
  transform: transformer.comorph(
    vitestConfigCodemod("vitest-4-workspace-projects", (config) => {
      const workspace = config.get("test.workspace");

      if (workspace.kind !== "value" || workspace.value().kind() === "Literal") {
        return;
      }

      const value = config.take("test.workspace").valueOrSkip();
      config.set("test.projects", value);
    }),
  ),
  shouldBlock: workspaceProjectsReviewBlocker,
};

function workspaceProjectsReviewBlocker(filePath: string): BlockCheckResult {
  const source = readMigrationFileSync(filePath);

  if (/\bworkspace\s*:\s*['"][^'"]*vitest\.workspace\.[^'"]*['"]/.test(source)) {
    return {
      reason:
        "test.workspace points at a workspace file; move that file's project array into test.projects.",
    };
  }

  return false;
}

export { workspaceProjectsChange };
