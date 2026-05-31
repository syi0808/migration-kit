import type { JscodeshiftCore } from "migration-kit";

type NodePath = {
  node: any;
  parent?: NodePath | null;
};

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

function isStringLiteral(node: any): boolean {
  return (
    (node?.type === "StringLiteral" || node?.type === "Literal") && typeof node.value === "string"
  );
}

export {
  getObjectPropertyName,
  isArrayExpression,
  isObjectExpression,
  isStringLiteral,
  isUnderObjectProperty,
  isUnderPropertyChain,
  isVitestTestCall,
  setObjectPropertyName,
};
export type { NodePath };
