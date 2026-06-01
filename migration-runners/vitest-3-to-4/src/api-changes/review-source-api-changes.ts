import { readMigrationFileSync, type ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import { parseSource } from "../utils/jscodeshift.js";

type SourceReviewFinding = {
  kind: "manual-fix" | "manual-confirmation";
  reason: string;
  prompt?: string;
};

const reviewSourceApiChanges: ApiChange = {
  title: "Review Vitest 4 source API changes",
  description:
    "Flags browser utility imports, removed internal APIs, custom environments, reporter APIs, constructor global mocks, vi.mock factory hoisting risks, restoreAllMocks, and deprecated types.",
  policy: "blocking",
  files: sourceFilePatterns,
  shouldBlock: sourceReviewBlocker as NonNullable<ApiChange["shouldBlock"]>,
};

function sourceReviewBlocker(filePath: string) {
  const findings = collectSourceReviewFindings(readMigrationFileSync(filePath), filePath);

  return toBlockResult(findings);
}

function collectSourceReviewReasons(source: string): string[] {
  return collectSourceReviewFindings(source).map((finding) => finding.reason);
}

function collectSourceReviewFindings(
  source: string,
  filePath = "source.tsx",
): SourceReviewFinding[] {
  const findings: SourceReviewFinding[] = [];

  addManualFixIf(
    findings,
    source.includes("@vitest/browser/utils"),
    "Replace @vitest/browser/utils imports with utilities from vitest/browser.",
  );
  addManualFixIf(
    findings,
    source.includes("vitest/execute"),
    "vitest/execute was removed; migrate internal runner integrations to the new module runner APIs.",
  );
  addManualFixIf(
    findings,
    source.includes("__vitest_executor"),
    "__vitest_executor is no longer injected; use the injected moduleRunner where applicable.",
  );
  addManualFixIf(
    findings,
    /\btransformMode\s*:/.test(source),
    "Custom Vitest environments no longer need transformMode; provide viteEnvironment when needed.",
  );
  addManualConfirmationIf(
    findings,
    /\bvi\.restoreAllMocks\s*\(/.test(source),
    "vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
  );
  const unsafeMockFactoryReferences = collectUnsafeViMockFactoryReferences(source, filePath);

  addManualFixIf(
    findings,
    unsafeMockFactoryReferences.length > 0,
    `vi.mock factories reference top-level bindings (${unsafeMockFactoryReferences.join(", ")}); move shared mocks into vi.hoisted or use vi.doMock with dynamic import.`,
  );
  const constructorGlobalMocks = collectNonConstructableGlobalMockNames(source);

  addManualFixIf(
    findings,
    constructorGlobalMocks.length > 0,
    `Vitest 4 constructs mocks called with new; replace arrow/mockReturnValue global constructor stubs (${constructorGlobalMocks.join(", ")}) with function or class implementations.`,
  );
  addManualFixIf(
    findings,
    /\b(onCollected|onSpecsCollected|onPathsCollected|onTaskUpdate|onFinished)\s*\(/.test(source),
    "Several reporter APIs were removed; migrate custom reporters to the Vitest 4 reporter API.",
  );
  addManualFixIf(
    findings,
    /\b(SpyInstance|WorkspaceSpec)\b/.test(source),
    "Deprecated Vitest types were removed; replace them with current public types.",
  );

  return findings;
}

const constructableGlobalNames = [
  "AbortController",
  "AudioContext",
  "BroadcastChannel",
  "DOMParser",
  "EventSource",
  "FileReader",
  "Image",
  "IntersectionObserver",
  "MediaRecorder",
  "MutationObserver",
  "OfflineAudioContext",
  "PerformanceObserver",
  "ResizeObserver",
  "SharedWorker",
  "URL",
  "URLSearchParams",
  "WebSocket",
  "Worker",
  "XMLSerializer",
];

const constructableGlobalPattern = constructableGlobalNames.join("|");
const badConstructorMockPattern =
  String.raw`vi\s*\.\s*fn\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>` +
  "|" +
  String.raw`vi\s*\.\s*fn\s*\(\s*\)\s*\.\s*mock(?:ReturnValue|ResolvedValue|RejectedValue)\s*\(` +
  "|" +
  String.raw`vi\s*\.\s*fn\s*\(\s*\)\s*\.\s*mockImplementation\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>`;
const traversalSkipKeys = new Set([
  "comments",
  "end",
  "extra",
  "leadingComments",
  "loc",
  "range",
  "start",
  "trailingComments",
  "typeAnnotation",
  "typeParameters",
  "returnType",
  "implements",
]);

function collectNonConstructableGlobalMockNames(source: string): string[] {
  const names = new Set<string>();

  collectInlineConstructorMocks(source, names);
  collectObjectDefinePropertyConstructorMocks(source, names);
  collectVariableAssignedConstructorMocks(source, names);

  return constructableGlobalNames.filter((name) => names.has(name));
}

function collectInlineConstructorMocks(source: string, names: Set<string>) {
  const stubGlobalRegex = new RegExp(
    String.raw`\bvi\s*\.\s*stubGlobal\s*\(\s*['"](${constructableGlobalPattern})['"]\s*,\s*(?:${badConstructorMockPattern})`,
    "g",
  );
  const assignmentRegex = new RegExp(
    String.raw`\b(?:global|globalThis|window)\s*\.\s*(${constructableGlobalPattern})\s*=\s*(?:${badConstructorMockPattern})`,
    "g",
  );

  collectMatches(stubGlobalRegex, source, names);
  collectMatches(assignmentRegex, source, names);
}

function collectObjectDefinePropertyConstructorMocks(source: string, names: Set<string>) {
  const definePropertyRegex = new RegExp(
    String.raw`\bObject\s*\.\s*defineProperty\s*\(\s*(?:global|globalThis|window)\s*,\s*['"](${constructableGlobalPattern})['"][\s\S]{0,400}?\bvalue\s*:\s*(?:${badConstructorMockPattern})`,
    "g",
  );

  collectMatches(definePropertyRegex, source, names);
}

function collectVariableAssignedConstructorMocks(source: string, names: Set<string>) {
  const badMockVariables = new Set<string>();
  const plainMockVariables = new Set<string>();
  const variableRegex = new RegExp(
    String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:${badConstructorMockPattern})`,
    "g",
  );
  const plainVariableRegex = new RegExp(
    String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*vi\s*\.\s*fn\s*\(\s*\)`,
    "g",
  );
  const assignmentRegex = new RegExp(
    String.raw`\b(?:global|globalThis|window)\s*\.\s*(${constructableGlobalPattern})\s*=\s*([A-Za-z_$][\w$]*)\b`,
    "g",
  );

  for (const match of source.matchAll(variableRegex)) {
    const variableName = match[1];

    if (variableName) {
      badMockVariables.add(variableName);
    }
  }

  for (const match of source.matchAll(plainVariableRegex)) {
    const variableName = match[1];

    if (variableName) {
      plainMockVariables.add(variableName);
    }
  }

  for (const match of source.matchAll(assignmentRegex)) {
    const globalName = match[1];
    const variableName = match[2];

    if (!globalName || !variableName) {
      continue;
    }

    const usesBadMockVariable =
      badMockVariables.has(variableName) ||
      (plainMockVariables.has(variableName) &&
        hasBadMockVariableImplementation(source, variableName));

    if (usesBadMockVariable) {
      names.add(globalName);
    }
  }
}

function hasBadMockVariableImplementation(source: string, variableName: string): boolean {
  const escapedVariableName = escapeRegExp(variableName);
  const badVariableImplementationRegex = new RegExp(
    String.raw`\b${escapedVariableName}\s*\.\s*mock(?:ReturnValue|ResolvedValue|RejectedValue)\s*\(` +
      "|" +
      String.raw`\b${escapedVariableName}\s*\.\s*mockImplementation\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>`,
  );

  return badVariableImplementationRegex.test(source);
}

function collectUnsafeViMockFactoryReferences(source: string, filePath = "source.tsx"): string[] {
  let program: any | null = null;

  try {
    const { j, root } = parseSource(filePath, source);

    root.find(j.Program).forEach((path: any) => {
      program ??= path.node;
    });
  } catch {
    return [];
  }

  if (!program) {
    return [];
  }

  const topLevelBindings = collectTopLevelRuntimeBindings(program);
  const viHoistedBindings = collectTopLevelViHoistedBindings(program);
  const unsafeReferences = new Set<string>();

  walkAst(program, (node) => {
    if (!isViMockCall(node)) {
      return;
    }

    const factory = node.arguments?.[1];

    if (!isFunctionLike(factory)) {
      return;
    }

    collectUnsafeFactoryReferences(factory, topLevelBindings, viHoistedBindings, unsafeReferences);
  });

  return [...unsafeReferences].sort((left, right) => left.localeCompare(right));
}

function collectTopLevelRuntimeBindings(program: any): Set<string> {
  const names = new Set<string>();

  for (const statement of program.body ?? []) {
    if (statement.type === "ImportDeclaration" && statement.importKind !== "type") {
      for (const specifier of statement.specifiers ?? []) {
        if (specifier.importKind === "type") {
          continue;
        }

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

    if (statement.type === "ClassDeclaration" || statement.type === "TSEnumDeclaration") {
      collectBindingNames(statement.id, names);
    }
  }

  names.delete("vi");

  return names;
}

function collectTopLevelViHoistedBindings(program: any): Set<string> {
  const names = new Set<string>();

  for (const statement of program.body ?? []) {
    if (statement.type !== "VariableDeclaration") {
      continue;
    }

    for (const declaration of statement.declarations ?? []) {
      if (isViHoistedCall(declaration.init)) {
        collectBindingNames(declaration.id, names);
      }
    }
  }

  return names;
}

function collectUnsafeFactoryReferences(
  factory: any,
  topLevelBindings: ReadonlySet<string>,
  viHoistedBindings: ReadonlySet<string>,
  unsafeReferences: Set<string>,
) {
  const factoryBindings = collectFactoryBindings(factory);

  walkAst(factory.body, (node, parent, key) => {
    if (
      node.type !== "Identifier" ||
      !isIdentifierReference(node, parent, key) ||
      !topLevelBindings.has(node.name) ||
      factoryBindings.has(node.name) ||
      viHoistedBindings.has(node.name)
    ) {
      return;
    }

    unsafeReferences.add(node.name);
  });
}

function collectFactoryBindings(factory: any): Set<string> {
  const names = new Set<string>();

  for (const parameter of factory.params ?? []) {
    collectBindingNames(parameter, names);
  }

  walkAst(factory.body, (node) => {
    if (node.type === "VariableDeclarator") {
      collectBindingNames(node.id, names);
      return;
    }

    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
      collectBindingNames(node.id, names);

      for (const parameter of node.params ?? []) {
        collectBindingNames(parameter, names);
      }

      return;
    }

    if (node.type === "ArrowFunctionExpression") {
      for (const parameter of node.params ?? []) {
        collectBindingNames(parameter, names);
      }

      return;
    }

    if (node.type === "ClassDeclaration") {
      collectBindingNames(node.id, names);
      return;
    }

    if (node.type === "CatchClause") {
      collectBindingNames(node.param, names);
    }
  });

  return names;
}

function collectBindingNames(node: any, names: Set<string>) {
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

    return;
  }

  if (node.type === "TSParameterProperty") {
    collectBindingNames(node.parameter, names);
  }
}

function isViMockCall(node: any): boolean {
  return isViMemberCall(node, "mock");
}

function isViHoistedCall(node: any): boolean {
  return isViMemberCall(node, "hoisted");
}

function isViMemberCall(node: any, methodName: string): boolean {
  return (
    node?.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === "vi" &&
    !node.callee.computed &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === methodName
  );
}

function isFunctionLike(node: any): boolean {
  return node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";
}

function isIdentifierReference(node: any, parent: any, key?: string): boolean {
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
      parent.type === "Property") &&
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
    (parent.type === "ImportSpecifier" && key === "local") ||
    (parent.type === "ImportDefaultSpecifier" && key === "local") ||
    (parent.type === "ImportNamespaceSpecifier" && key === "local") ||
    (parent.type === "LabeledStatement" && key === "label") ||
    ((parent.type === "BreakStatement" || parent.type === "ContinueStatement") && key === "label")
  ) {
    return false;
  }

  if (Array.isArray(parent.params) && parent.params.includes(node)) {
    return false;
  }

  return true;
}

function walkAst(
  node: any,
  visit: (node: any, parent?: any, key?: string) => void,
  parent?: any,
  parentKey?: string,
) {
  if (!node || typeof node !== "object") {
    return;
  }

  visit(node, parent, parentKey);

  for (const key of Object.keys(node)) {
    if (traversalSkipKeys.has(key)) {
      continue;
    }

    const value = node[key];

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === "string") {
          walkAst(child, visit, node, key);
        }
      }

      continue;
    }

    if (value && typeof value.type === "string") {
      walkAst(value, visit, node, key);
    }
  }
}

function collectMatches(regex: RegExp, source: string, names: Set<string>) {
  for (const match of source.matchAll(regex)) {
    const name = match[1];

    if (name) {
      names.add(name);
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addManualFixIf(findings: SourceReviewFinding[], condition: boolean, reason: string) {
  if (condition) {
    findings.push({ kind: "manual-fix", reason });
  }
}

function addManualConfirmationIf(
  findings: SourceReviewFinding[],
  condition: boolean,
  reason: string,
) {
  if (condition) {
    findings.push({
      kind: "manual-confirmation",
      reason,
      prompt: "Confirm Vitest 4 mock cleanup behavior was manually verified before continuing.",
    });
  }
}

function toBlockResult(findings: SourceReviewFinding[]) {
  if (findings.length === 0) {
    return false;
  }

  return findings.length === 1 ? findings[0] : findings;
}

export {
  collectSourceReviewFindings,
  collectSourceReviewReasons,
  reviewSourceApiChanges,
  sourceReviewBlocker,
};
