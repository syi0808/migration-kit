import { transformer } from "migration-kit";
import type { ApiChange, JscodeshiftCore, Transformer } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import { type NodePath } from "../utils/jscodeshift.js";
import type {
  DeprecatedTypeReplacement,
  ImportToAdd,
} from "./update-deprecated-type-imports.types.js";

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

function createDeprecatedTypeImportsTransform(): Transformer {
  return transformer.jscodeshift((fileInfo, api): string => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;
    const renamedReferences = new Map<string, string>();
    const importsToAdd: ImportToAdd[] = [];

    root.find(j.ImportDeclaration).forEach((path: NodePath): void => {
      const moduleName = path.node.source?.value;

      if (moduleName !== "vitest" && moduleName !== "vitest/node") {
        return;
      }

      for (const specifier of (path.node.specifiers ?? []).slice()) {
        if (specifier.type !== "ImportSpecifier") {
          continue;
        }

        const importedName = getImportSpecifierName(specifier.imported);
        const replacementName = importedName ? deprecatedVitestTypes.get(importedName) : null;

        if (!importedName || !replacementName) {
          continue;
        }

        const localName = specifier.local?.name ?? importedName;

        if (replacementName.module !== moduleName) {
          removeImportSpecifier(path.node, specifier);
          importsToAdd.push({
            importedName: replacementName.name,
            localName: localName === importedName ? replacementName.name : localName,
            moduleName: replacementName.module,
          });
        } else {
          specifier.imported = j.identifier(replacementName.name);
          specifier.importKind = path.node.importKind === "type" ? null : "type";

          if (localName === importedName) {
            specifier.local = null;
          } else {
            specifier.local = j.identifier(localName);
          }
        }

        if (localName === importedName) {
          renamedReferences.set(importedName, replacementName.name);
        }

        changed = true;
      }

      if ((path.node.specifiers ?? []).length === 0) {
        (j as any)(path).remove();
      }
    });

    if (importsToAdd.length > 0) {
      addTypeImports(j, root, importsToAdd);
    }

    if (renamedReferences.size > 0) {
      root.find(j.Identifier).forEach((path: NodePath): void => {
        const replacementName = renamedReferences.get(path.node.name);

        if (!replacementName || !isIdentifierReference(path)) {
          return;
        }

        path.node.name = replacementName;
        changed = true;
      });
    }

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

function getImportSpecifierName(node: any): string | null {
  if (!node) {
    return null;
  }

  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "StringLiteral" || node.type === "Literal") {
    return typeof node.value === "string" ? node.value : null;
  }

  return null;
}

function isIdentifierReference(path: NodePath): boolean {
  const parent = path.parent?.node;
  const key = (path as any).name;

  if (!parent) {
    return true;
  }

  if (
    (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
    key === "property" &&
    !parent.computed
  ) {
    return false;
  }

  if (
    (parent.type === "ObjectProperty" ||
      parent.type === "ObjectMethod" ||
      parent.type === "Property" ||
      parent.type === "TSPropertySignature") &&
    key === "key" &&
    !parent.computed
  ) {
    return false;
  }

  if (
    (parent.type === "VariableDeclarator" && key === "id") ||
    (parent.type === "FunctionDeclaration" && key === "id") ||
    (parent.type === "FunctionExpression" && key === "id") ||
    (parent.type === "ClassDeclaration" && key === "id") ||
    (parent.type === "ClassExpression" && key === "id") ||
    (parent.type === "ImportSpecifier" && (key === "imported" || key === "local")) ||
    (parent.type === "ImportDefaultSpecifier" && key === "local") ||
    (parent.type === "ImportNamespaceSpecifier" && key === "local") ||
    (parent.type === "ExportSpecifier" && (key === "local" || key === "exported")) ||
    (parent.type === "TSTypeAliasDeclaration" && key === "id") ||
    (parent.type === "TSInterfaceDeclaration" && key === "id") ||
    (parent.type === "TSEnumDeclaration" && key === "id") ||
    (parent.type === "LabeledStatement" && key === "label") ||
    ((parent.type === "BreakStatement" || parent.type === "ContinueStatement") && key === "label")
  ) {
    return false;
  }

  if (Array.isArray(parent.params) && parent.params.includes(path.node)) {
    return false;
  }

  return true;
}

function removeImportSpecifier(importDeclaration: any, specifier: any): void {
  const index = importDeclaration.specifiers?.indexOf(specifier) ?? -1;

  if (index !== -1) {
    importDeclaration.specifiers.splice(index, 1);
  }
}

function addTypeImports(j: JscodeshiftCore, root: any, importsToAdd: ImportToAdd[]): void {
  const program = getProgram(j, root);

  if (!program) {
    return;
  }

  for (const importToAdd of importsToAdd) {
    const specifier = j.importSpecifier(j.identifier(importToAdd.importedName));

    if (importToAdd.localName !== importToAdd.importedName) {
      specifier.local = j.identifier(importToAdd.localName);
    }

    const existingImport = findTypeImport(program, importToAdd.moduleName);

    if (existingImport) {
      existingImport.specifiers ??= [];
      existingImport.specifiers.push(specifier);
      continue;
    }

    const declaration = j.importDeclaration([specifier], j.stringLiteral(importToAdd.moduleName));

    declaration.importKind = "type";
    program.body.splice(getImportInsertionIndex(program), 0, declaration);
  }
}

function getProgram(j: JscodeshiftCore, root: any): any | null {
  let program: any | null = null;

  root.find(j.Program).forEach((path: NodePath): void => {
    program ??= path.node;
  });

  return program;
}

function findTypeImport(program: any, moduleName: string): any | null {
  return (
    (program.body ?? []).find(
      (statement: any) =>
        statement.type === "ImportDeclaration" &&
        statement.importKind === "type" &&
        statement.source?.value === moduleName,
    ) ?? null
  );
}

function getImportInsertionIndex(program: any): number {
  let index = 0;

  while (program.body[index]?.type === "ImportDeclaration") {
    index += 1;
  }

  return index;
}

export { createDeprecatedTypeImportsTransform, updateDeprecatedTypeImports };
