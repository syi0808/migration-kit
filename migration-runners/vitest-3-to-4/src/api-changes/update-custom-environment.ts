import { codemod, object } from "comorph";
import { transformer } from "migration-kit";
import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";

const updateCustomEnvironment: ApiChange = {
  title: "Update custom environment transform mode",
  description:
    "Rewrites custom environment transformMode to Vitest 4 viteEnvironment when the value is known.",
  files: sourceFilePatterns,
  transform: transformer.comorph(
    codemod("vitest-4-custom-environment", ({ files }) => {
      files
        .jsLike()
        .findNode({ kind: "ObjectExpression" })
        .edit(({ node }) => {
          const environment = object(node);

          if (environment.has("transformMode").kind !== "yes") {
            return;
          }

          if (environment.has("viteEnvironment").kind === "yes") {
            environment.remove("transformMode");
            return;
          }

          const transformMode = environment.get("transformMode");

          if (transformMode.kind !== "value") {
            return;
          }

          const source = transformMode.value().text();
          const viteEnvironment = getViteEnvironmentValue(source.slice(1, -1));

          if (!viteEnvironment) {
            return;
          }

          environment.remove("transformMode");
          environment.set("viteEnvironment", viteEnvironment);
        });
    }),
  ),
};

function getViteEnvironmentValue(transformMode: string): string | null {
  if (transformMode === "ssr") {
    return "ssr";
  }

  if (transformMode === "web") {
    return "client";
  }

  return null;
}

export { updateCustomEnvironment };
