import { codemod, imports } from "comorph";
import { transformer } from "migration-kit";
import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import type { DeprecatedTypeReplacement } from "./update-deprecated-type-imports.types.js";

const deprecatedVitestTypes = new Map<string, DeprecatedTypeReplacement>([
  ["SpyInstance", { name: "MockInstance", module: "vitest" }],
  ["WorkspaceSpec", { name: "TestSpecification", module: "vitest/node" }],
]);

const updateDeprecatedTypeImports: ApiChange = {
  title: "Update removed Vitest type imports",
  description: "Rewrites removed Vitest 4 type imports to their current public type names.",
  files: sourceFilePatterns,
  transform: createDeprecatedTypeImportsTransform(),
};

function createDeprecatedTypeImportsTransform() {
  return transformer.comorph(
    codemod("vitest-4-deprecated-type-imports", ({ files }) => {
      files
        .jsLike()
        .findNode({ kind: "Program" })
        .edit(() => {
          const manager = imports();

          for (const source of ["vitest", "vitest/node"]) {
            for (const [deprecatedName, replacement] of deprecatedVitestTypes) {
              rewriteDeprecatedTypeImport(manager, source, deprecatedName, replacement, true);
              rewriteDeprecatedTypeImport(manager, source, deprecatedName, replacement, false);
            }
          }
        });
    }),
  );
}

function rewriteDeprecatedTypeImport(
  manager: ReturnType<typeof imports>,
  source: string,
  deprecatedName: string,
  replacement: DeprecatedTypeReplacement,
  typeOnly: boolean,
): void {
  const binding = manager.findNamed(deprecatedName, source, { typeOnly });

  if (binding.kind !== "value") {
    return;
  }

  const importedType = binding.valueOrFail();
  const localName = importedType.local();
  const shouldRenameReferences = localName === deprecatedName;
  const references = importedType.references();

  if (typeOnly && replacement.module === source) {
    importedType.renameImported(replacement.name).valueOrFail();
  } else {
    manager.removeNamed(deprecatedName, source, { typeOnly });
    manager.addNamed(replacement.name, replacement.module, {
      local: shouldRenameReferences ? replacement.name : localName,
      typeOnly: true,
    });
  }

  if (shouldRenameReferences) {
    for (const reference of references) {
      reference.replaceName(replacement.name);
    }
  }
}

export { createDeprecatedTypeImportsTransform, updateDeprecatedTypeImports };
