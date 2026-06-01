import { readFileSync } from "node:fs";
import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";

const reviewSourceApiChanges: ApiChange = {
  title: "Review Vitest 4 source API changes",
  description:
    "Flags browser utility imports, removed internal APIs, custom environments, reporter APIs, constructor global mocks, restoreAllMocks, and deprecated types.",
  policy: "blocking",
  files: sourceFilePatterns,
  shouldBlock: sourceReviewBlocker,
};

function sourceReviewBlocker(filePath: string) {
  const reasons = collectSourceReviewReasons(readFileSync(filePath, "utf8"));

  if (reasons.length === 0) {
    return false;
  }

  return { reason: reasons.join(" ") };
}

function collectSourceReviewReasons(source: string): string[] {
  const reasons: string[] = [];

  addIf(
    reasons,
    source.includes("@vitest/browser/utils"),
    "Replace @vitest/browser/utils imports with utilities from vitest/browser.",
  );
  addIf(
    reasons,
    source.includes("vitest/execute"),
    "vitest/execute was removed; migrate internal runner integrations to the new module runner APIs.",
  );
  addIf(
    reasons,
    source.includes("__vitest_executor"),
    "__vitest_executor is no longer injected; use the injected moduleRunner where applicable.",
  );
  addIf(
    reasons,
    /\btransformMode\s*:/.test(source),
    "Custom Vitest environments no longer need transformMode; provide viteEnvironment when needed.",
  );
  addIf(
    reasons,
    /\bvi\.restoreAllMocks\s*\(/.test(source),
    "vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
  );
  const constructorGlobalMocks = collectNonConstructableGlobalMockNames(source);

  addIf(
    reasons,
    constructorGlobalMocks.length > 0,
    `Vitest 4 constructs mocks called with new; replace arrow/mockReturnValue global constructor stubs (${constructorGlobalMocks.join(", ")}) with function or class implementations.`,
  );
  addIf(
    reasons,
    /\b(onCollected|onSpecsCollected|onPathsCollected|onTaskUpdate|onFinished)\s*\(/.test(source),
    "Several reporter APIs were removed; migrate custom reporters to the Vitest 4 reporter API.",
  );
  addIf(
    reasons,
    /\b(SpyInstance|WorkspaceSpec)\b/.test(source),
    "Deprecated Vitest types were removed; replace them with current public types.",
  );

  return reasons;
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

function addIf(reasons: string[], condition: boolean, reason: string) {
  if (condition) {
    reasons.push(reason);
  }
}

export { collectSourceReviewReasons, reviewSourceApiChanges, sourceReviewBlocker };
