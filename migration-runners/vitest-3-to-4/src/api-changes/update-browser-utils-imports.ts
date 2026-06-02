import { transformer } from "migration-kit";
import type { ApiChange, JscodeshiftCore, Transformer } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import { type NodePath } from "../utils/jscodeshift.js";
import type { BrowserUtilsNamedImport } from "./update-browser-utils-imports.types.js";

const browserUtilsModule = "@vitest/browser/utils";
const browserModule = "vitest/browser";

const updateBrowserUtilsImports: ApiChange = {
  title: "Update @vitest/browser utils imports",
  description:
    "Rewrites supported @vitest/browser/utils imports to the Vitest 4 vitest/browser utils export.",
  files: sourceFilePatterns,
  transform: createBrowserUtilsImportsTransform(),
};

function createBrowserUtilsImportsTransform(): Transformer {
  return transformer.jscodeshift((fileInfo, api): string => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    const program = getProgram(j, root);

    if (!program) {
      return fileInfo.source;
    }

    const existingBindings = collectTopLevelBindingNames(program);
    const namedImports: BrowserUtilsNamedImport[] = [];
    const namespaceImportNames: string[] = [];
    let changed = false;

    for (const statement of program.body.slice()) {
      if (!isImportFrom(statement, browserUtilsModule) || !isSupportedUtilsImport(statement)) {
        continue;
      }

      for (const specifier of statement.specifiers ?? []) {
        if (specifier.type === "ImportNamespaceSpecifier" && specifier.local?.name) {
          namespaceImportNames.push(specifier.local.name);
          continue;
        }

        if (specifier.type !== "ImportSpecifier") {
          continue;
        }

        const importedName = getImportSpecifierName(specifier.imported);
        const localName = specifier.local?.name ?? importedName;

        if (importedName && localName) {
          namedImports.push({ importedName, localName });
        }
      }

      removeStatement(program, statement);
      changed = true;
    }

    if (!changed) {
      return fileInfo.source;
    }

    let utilsLocalName: string | null = null;

    if (namedImports.length > 0) {
      utilsLocalName =
        findExistingBrowserUtilsImport(program) ??
        addBrowserUtilsImport(j, program, pickAvailableName(existingBindings, "utils"));

      program.body.splice(
        getImportInsertionIndex(program),
        0,
        createUtilsDestructure(j, namedImports, utilsLocalName),
      );
    }

    for (const namespaceImportName of namespaceImportNames) {
      addBrowserUtilsImport(j, program, namespaceImportName);
    }

    return root.toSource({ quote: "single" });
  });
}

function getProgram(j: JscodeshiftCore, root: any): any | null {
  let program: any | null = null;

  root.find(j.Program).forEach((path: NodePath): void => {
    program ??= path.node;
  });

  return program;
}

function isImportFrom(statement: any, moduleName: string): boolean {
  return statement.type === "ImportDeclaration" && statement.source?.value === moduleName;
}

function isSupportedUtilsImport(statement: any): boolean {
  if (statement.importKind === "type") {
    return false;
  }

  const specifiers = statement.specifiers ?? [];

  return (
    specifiers.length > 0 &&
    specifiers.every((specifier: any): boolean => {
      if (specifier.importKind === "type") {
        return false;
      }

      return specifier.type === "ImportSpecifier" || specifier.type === "ImportNamespaceSpecifier";
    })
  );
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

function collectTopLevelBindingNames(program: any): Set<string> {
  const names = new Set<string>();

  for (const statement of program.body ?? []) {
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers ?? []) {
        collectBindingNames(specifier.local, names);
      }

      continue;
    }

    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations ?? []) {
        collectBindingNames(declaration.id, names);
      }

      continue;
    }

    if (
      statement.type === "FunctionDeclaration" ||
      statement.type === "ClassDeclaration" ||
      statement.type === "TSEnumDeclaration"
    ) {
      collectBindingNames(statement.id, names);
    }
  }

  return names;
}

function collectBindingNames(node: any, names: Set<string>): void {
  if (!node) {
    return;
  }

  if (node.type === "Identifier") {
    names.add(node.name);
    return;
  }

  if (node.type === "RestElement") {
    collectBindingNames(node.argument, names);
    return;
  }

  if (node.type === "AssignmentPattern") {
    collectBindingNames(node.left, names);
    return;
  }

  if (node.type === "ObjectPattern") {
    for (const property of node.properties ?? []) {
      if (property.type === "RestElement") {
        collectBindingNames(property.argument, names);
        continue;
      }

      collectBindingNames(property.value, names);
    }

    return;
  }

  if (node.type === "ArrayPattern") {
    for (const element of node.elements ?? []) {
      collectBindingNames(element, names);
    }
  }
}

function removeStatement(program: any, statement: any): void {
  const index = program.body.indexOf(statement);

  if (index !== -1) {
    program.body.splice(index, 1);
  }
}

function findExistingBrowserUtilsImport(program: any): string | null {
  for (const statement of program.body ?? []) {
    if (!isImportFrom(statement, browserModule)) {
      continue;
    }

    for (const specifier of statement.specifiers ?? []) {
      if (
        specifier.type === "ImportSpecifier" &&
        getImportSpecifierName(specifier.imported) === "utils" &&
        specifier.local?.name
      ) {
        return specifier.local.name;
      }
    }
  }

  return null;
}

function addBrowserUtilsImport(j: JscodeshiftCore, program: any, localName: string): string {
  const specifier = j.importSpecifier(j.identifier("utils"), j.identifier(localName));

  if (localName === "utils") {
    specifier.local = null;
  }

  const existingImport = findBrowserImport(program);

  if (existingImport) {
    existingImport.specifiers ??= [];
    existingImport.specifiers.push(specifier);
    return localName;
  }

  program.body.splice(
    getImportInsertionIndex(program),
    0,
    j.importDeclaration([specifier], j.stringLiteral(browserModule)),
  );

  return localName;
}

function findBrowserImport(program: any): any | null {
  return (
    (program.body ?? []).find((statement: any) => isImportFrom(statement, browserModule)) ?? null
  );
}

function getImportInsertionIndex(program: any): number {
  let index = 0;

  while (program.body[index]?.type === "ImportDeclaration") {
    index += 1;
  }

  return index;
}

function createUtilsDestructure(
  j: JscodeshiftCore,
  namedImports: BrowserUtilsNamedImport[],
  utilsLocalName: string,
): any {
  const properties = namedImports.map(({ importedName, localName }): any => {
    const property = j.objectProperty(j.identifier(importedName), j.identifier(localName));

    property.shorthand = importedName === localName;

    return property;
  });

  return j.variableDeclaration("const", [
    j.variableDeclarator(j.objectPattern(properties), j.identifier(utilsLocalName)),
  ]);
}

function pickAvailableName(existingBindings: ReadonlySet<string>, preferredName: string): string {
  if (!existingBindings.has(preferredName)) {
    return preferredName;
  }

  for (const candidate of ["browserUtils", "vitestBrowserUtils"]) {
    if (!existingBindings.has(candidate)) {
      return candidate;
    }
  }

  let index = 2;

  while (existingBindings.has(`vitestBrowserUtils${index}`)) {
    index += 1;
  }

  return `vitestBrowserUtils${index}`;
}

export { createBrowserUtilsImportsTransform, updateBrowserUtilsImports };
