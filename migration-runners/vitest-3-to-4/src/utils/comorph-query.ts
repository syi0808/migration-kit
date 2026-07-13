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
  const path = property.staticPath();
  return path.kind === "value" && path.value !== undefined ? path.value.split(".") : null;
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
