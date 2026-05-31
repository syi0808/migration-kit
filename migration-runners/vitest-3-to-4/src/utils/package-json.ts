import semver from "semver";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

const vitestFamilyPackages = [
  "vitest",
  "@vitest/coverage-v8",
  "@vitest/coverage-istanbul",
  "@vitest/ui",
  "@vitest/browser-playwright",
  "@vitest/browser-webdriverio",
] as const;

type JsonObject = Record<string, unknown>;

function updateDependencyRange(
  dependencies: Record<string, unknown>,
  packageName: string,
  targetRange: string,
  requiredRange: string,
): boolean {
  const currentRange = dependencies[packageName];

  if (
    typeof currentRange !== "string" ||
    !currentRange ||
    dependencyRangeSatisfies(currentRange, requiredRange)
  ) {
    return false;
  }

  const protocol = getPreservedProtocol(currentRange);

  dependencies[packageName] = protocol ? `${protocol}${targetRange}` : targetRange;

  return true;
}

function addPackageRangeReason(
  reasons: string[],
  dependencies: Record<string, unknown>,
  packageName: string,
  requiredRange: string,
) {
  const currentRange = dependencies[packageName];

  if (typeof currentRange !== "string" || !currentRange) {
    return;
  }

  const normalizedRange = normalizeDependencyRange(currentRange);

  if (!normalizedRange) {
    reasons.push(`${packageName} uses ${currentRange}, which could not be verified automatically.`);
    return;
  }

  if (!semver.subset(normalizedRange, requiredRange, { includePrerelease: true })) {
    reasons.push(
      `${packageName} should satisfy ${requiredRange}; current range is ${currentRange}.`,
    );
  }
}

function dependencyRangeSatisfies(range: string, requiredRange: string): boolean {
  const normalizedRange = normalizeDependencyRange(range);

  if (!normalizedRange) {
    return true;
  }

  return semver.subset(normalizedRange, requiredRange, { includePrerelease: true });
}

function normalizeDependencyRange(range: string): string | null {
  const withoutProtocol = range.startsWith("workspace:") ? range.slice("workspace:".length) : range;

  if (!withoutProtocol || withoutProtocol === "*" || withoutProtocol.startsWith("catalog:")) {
    return null;
  }

  return semver.validRange(withoutProtocol, { includePrerelease: true });
}

function getPreservedProtocol(range: string): string | null {
  if (range.startsWith("workspace:") && normalizeDependencyRange(range)) {
    return "workspace:";
  }

  return null;
}

function readStringRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringifyPackageJson(packageJson: JsonObject, originalSource: string): string {
  const indent = detectJsonIndent(originalSource);
  const newline = originalSource.endsWith("\n") ? "\n" : "";

  return `${JSON.stringify(packageJson, null, indent)}${newline}`;
}

function detectJsonIndent(source: string): string | number {
  const match = source.match(/\n([ \t]+)"/);

  return match?.[1] ?? 2;
}

export {
  addPackageRangeReason,
  dependencyFields,
  readStringRecord,
  stringifyPackageJson,
  updateDependencyRange,
  vitestFamilyPackages,
};
export type { JsonObject };
