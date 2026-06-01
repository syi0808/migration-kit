import { createRequire } from "node:module";
import { extname } from "node:path";
import type { JscodeshiftCore } from "migration-kit";
import type { JscodeshiftParser } from "migration-kit";

type NodePath = {
  node: any;
  parent?: NodePath | null;
};

const require = createRequire(import.meta.url);

function getObjectPropertyName(node: any): string | null {
  if (!node || node.type !== "ObjectProperty") {
    return null;
  }

  const key = node.key;

  if (!node.computed && key?.type === "Identifier") {
    return key.name;
  }

  if ((key?.type === "StringLiteral" || key?.type === "Literal") && typeof key.value === "string") {
    return key.value;
  }

  return null;
}

function findObjectProperty(node: any, name: string): any | null {
  if (!isObjectExpression(node)) {
    return null;
  }

  return node.properties.find((property: any) => getObjectPropertyName(property) === name) ?? null;
}

function removeObjectProperty(node: any, property: any): boolean {
  if (!isObjectExpression(node)) {
    return false;
  }

  const index = node.properties.indexOf(property);

  if (index === -1) {
    return false;
  }

  node.properties.splice(index, 1);

  return true;
}

function ensureObjectProperty(j: JscodeshiftCore, node: any, name: string): any | null {
  if (!isObjectExpression(node)) {
    return null;
  }

  const property = findObjectProperty(node, name);

  if (property) {
    return isObjectExpression(property.value) ? property.value : null;
  }

  const value = j.objectExpression([]);

  node.properties.push(j.objectProperty(j.identifier(name), value));

  return value;
}

function setObjectPropertyName(j: JscodeshiftCore, node: any, name: string) {
  if (node.key?.type === "Identifier" && !node.computed) {
    node.key.name = name;
    return;
  }

  node.key = j.identifier(name);
  node.computed = false;
}

function isUnderObjectProperty(path: NodePath, propertyName: string): boolean {
  let current = path.parent;

  while (current) {
    if (getObjectPropertyName(current.node) === propertyName) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function isUnderPropertyChain(path: NodePath, chainFromNearest: string[]): boolean {
  const names: string[] = [];
  let current = path.parent;

  while (current) {
    const propertyName = getObjectPropertyName(current.node);

    if (propertyName) {
      names.push(propertyName);
    }

    current = current.parent;
  }

  return chainFromNearest.every((name, index) => names[index] === name);
}

function isVitestTestCall(callee: any): boolean {
  const name = getRootCalleeName(callee);

  return name === "test" || name === "it" || name === "describe";
}

function getRootCalleeName(callee: any): string | null {
  if (!callee) {
    return null;
  }

  if (callee.type === "Identifier") {
    return callee.name;
  }

  if (callee.type === "MemberExpression") {
    return getRootCalleeName(callee.object);
  }

  return null;
}

function isArrayExpression(node: any): boolean {
  return node?.type === "ArrayExpression";
}

function isObjectExpression(node: any): boolean {
  return node?.type === "ObjectExpression";
}

function isBooleanLiteral(node: any): boolean {
  return (
    node?.type === "BooleanLiteral" || (node?.type === "Literal" && typeof node.value === "boolean")
  );
}

function isNumericLiteral(node: any): boolean {
  return (
    node?.type === "NumericLiteral" || (node?.type === "Literal" && typeof node.value === "number")
  );
}

function isStringLiteral(node: any): boolean {
  return (
    (node?.type === "StringLiteral" || node?.type === "Literal") && typeof node.value === "string"
  );
}

function parseSource(filePath: string, source: string) {
  const j = loadJscodeshift().withParser(inferParser(filePath));

  return { j, root: j(source) };
}

function inferParser(filePath: string): JscodeshiftParser {
  const extension = extname(filePath);

  if (extension === ".ts" || extension === ".mts" || extension === ".cts") {
    return "ts";
  }

  if (extension === ".tsx") {
    return "tsx";
  }

  return "babel";
}

function loadJscodeshift(): JscodeshiftCore {
  const module = require("jscodeshift") as JscodeshiftCore | { default: JscodeshiftCore };

  return "default" in module ? module.default : module;
}

export {
  ensureObjectProperty,
  findObjectProperty,
  getObjectPropertyName,
  isArrayExpression,
  isBooleanLiteral,
  isNumericLiteral,
  isObjectExpression,
  isStringLiteral,
  isUnderObjectProperty,
  isUnderPropertyChain,
  isVitestTestCall,
  parseSource,
  removeObjectProperty,
  setObjectPropertyName,
};
export type { NodePath };
