import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { createLogUpdate } from "log-update";
import type { PeerDependency } from "../types.js";
import semver from "semver";

function dependenciesTask(logUpdate: ReturnType<typeof createLogUpdate>, checks: PeerDependency[]) {
  const packageJson = readPackageJson(process.cwd());
  let hasFailure = false;

  for (const check of checks) {
    const result = checkPeerDependency(packageJson, check);

    if (!result.satisfied) {
      hasFailure = true;
    }

    logUpdate.persist(`  ${result.satisfied ? "✓" : "✗"} ${result.message}`);
  }

  if (hasFailure) {
    throw new Error("Dependency requirements were not met.");
  }
}

type PackageJson = {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
};

type DependencyCheckResult = {
  satisfied: boolean;
  message: string;
};

function checkPeerDependency(
  packageJson: PackageJson | null,
  check: PeerDependency,
): DependencyCheckResult {
  const label = `${check.dependency} ${check.requiredVersion}`;

  if (!packageJson) {
    return {
      satisfied: false,
      message: `${label} required, package.json not found or invalid`,
    };
  }

  const declaredVersion = readDependencyVersion(packageJson, check.dependency);

  if (!declaredVersion) {
    return {
      satisfied: false,
      message: `${label} required, dependency not found`,
    };
  }

  const declaredRange = normalizeDependencyRange(declaredVersion);

  if (!declaredRange) {
    return {
      satisfied: false,
      message: `${label} required, current ${declaredVersion} cannot be checked`,
    };
  }

  if (!semver.validRange(check.requiredVersion)) {
    return {
      satisfied: false,
      message: `${check.dependency} has invalid required range ${check.requiredVersion}`,
    };
  }

  const satisfied = semver.subset(declaredRange, check.requiredVersion, {
    includePrerelease: true,
  });

  return satisfied
    ? { satisfied: true, message: `${label} satisfied` }
    : {
        satisfied: false,
        message: `${label} required, current ${declaredVersion}`,
      };
}

function readPackageJson(cwd: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function readDependencyVersion(packageJson: PackageJson, dependency: string): string | null {
  return (
    readRecordString(packageJson.dependencies, dependency) ??
    readRecordString(packageJson.devDependencies, dependency) ??
    readRecordString(packageJson.optionalDependencies, dependency) ??
    readRecordString(packageJson.peerDependencies, dependency)
  );
}

function normalizeDependencyRange(version: string): string | null {
  const normalizedVersion = version.startsWith("workspace:")
    ? version.slice("workspace:".length)
    : version;

  if (normalizedVersion === "*" || normalizedVersion === "") {
    return null;
  }

  return semver.validRange(normalizedVersion, { includePrerelease: true });
}

function readRecordString(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export { dependenciesTask };
