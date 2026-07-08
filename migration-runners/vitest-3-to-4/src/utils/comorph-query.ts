import { capture, objectProperty, querySource } from "comorph";
import type { NodeCapture, ObjectPropertyCapture } from "comorph";

function hasObjectPropertyPath(
  source: string,
  filePath: string,
  path: readonly string[],
  predicate: (value: NodeCapture) => boolean = () => true,
): boolean {
  let found = false;

  querySource(source, { filePath, language: "jsLike" })
    .find(objectProperty`${capture("key")}: ${capture("value")}`)
    .forEach(({ property, value }) => {
      if (found) {
        return;
      }

      const propertyPath = getObjectPropertyPath(property);

      if (propertyPath && isSamePath(propertyPath, path) && predicate(value)) {
        found = true;
      }
    });

  return found;
}

function hasObjectPropertyPathWhere(
  source: string,
  filePath: string,
  predicate: (path: readonly string[], value: NodeCapture) => boolean,
): boolean {
  let found = false;

  querySource(source, { filePath, language: "jsLike" })
    .find(objectProperty`${capture("key")}: ${capture("value")}`)
    .forEach(({ property, value }) => {
      if (found) {
        return;
      }

      const path = getObjectPropertyPath(property);

      if (path && predicate(path, value)) {
        found = true;
      }
    });

  return found;
}

function getObjectPropertyPath(property: ObjectPropertyCapture): readonly string[] | null {
  const path: string[] = [];
  let current: NodeCapture | undefined = property;

  while (current) {
    if (current.kind() === "Property") {
      const key = getStaticPropertyKey(current.raw());

      if (!key) {
        return null;
      }

      path.unshift(key);
    }

    current = current.parent();
  }

  return path;
}

function getStaticPropertyKey(node: any): string | null {
  if (!node || node.type !== "Property" || node.computed) {
    return null;
  }

  const key = node.key;

  if (key?.type === "Identifier") {
    return key.name ?? null;
  }

  if ((key?.type === "Literal" || key?.type === "StringLiteral") && typeof key.value === "string") {
    return key.value;
  }

  return null;
}

function isStringLiteralNode(node: NodeCapture): boolean {
  const raw = node.raw() as any;

  return (
    (raw?.type === "Literal" || raw?.type === "StringLiteral") && typeof raw.value === "string"
  );
}

function isSamePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

export { hasObjectPropertyPath, hasObjectPropertyPathWhere, isStringLiteralNode };
