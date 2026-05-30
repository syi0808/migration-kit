import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { createLogUpdate } from "log-update";
import semver from "semver";
import type { PackageVersionUpdate } from "../types.js";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

const packageManagerLockfiles = [
  { fileName: "pnpm-lock.yaml", packageManager: "pnpm" },
  { fileName: "yarn.lock", packageManager: "yarn" },
  { fileName: "package-lock.json", packageManager: "npm" },
  { fileName: "npm-shrinkwrap.json", packageManager: "npm" },
  { fileName: "bun.lock", packageManager: "bun" },
  { fileName: "bun.lockb", packageManager: "bun" },
] as const;

type DependencyField = (typeof dependencyFields)[number];
type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type PackageJson = {
  packageManager?: unknown;
} & {
  [field in DependencyField]?: Record<string, unknown>;
};

type PackageVersionTaskOptions = {
  cwd?: string;
  from: string;
  to: string;
  runInstall?: RunPackageManagerInstall;
};

type RunPackageManagerInstall = (packageManager: PackageManager, cwd: string) => Promise<void>;

type PackageManagerDetection = {
  packageManager: PackageManager;
  source: string;
};

type PackageVersionUpdateResult =
  | {
      status: "updated";
      dependency: string;
      field: DependencyField;
      currentVersion: string;
      nextVersion: string;
    }
  | {
      status: "unchanged";
      dependency: string;
      reason: string;
    }
  | {
      status: "failed";
      dependency: string;
      reason: string;
    };

async function packageVersionTask(
  logUpdate: ReturnType<typeof createLogUpdate>,
  updates: PackageVersionUpdate[],
  options: PackageVersionTaskOptions,
) {
  const cwd = options.cwd ?? process.cwd();
  const packageJsonPath = join(cwd, "package.json");
  const packageJsonSource = readPackageJsonSource(packageJsonPath);

  if (!packageJsonSource) {
    throw new Error("package.json not found or invalid.");
  }

  const packageManager = detectPackageManager(cwd, packageJsonSource.packageJson);
  let hasFailure = false;
  let hasUpdate = false;

  logUpdate.persist(
    `  ✓ Detected ${packageManager.packageManager} package manager (${packageManager.source})`,
  );

  for (const update of updates) {
    const result = updatePackageVersion(packageJsonSource.packageJson, update, {
      from: update.from ?? options.from,
      to: update.to ?? options.to,
    });

    if (result.status === "updated") {
      hasUpdate = true;
      logUpdate.persist(
        `  ✓ ${result.dependency} ${result.currentVersion} -> ${result.nextVersion} (${result.field})`,
      );
      continue;
    }

    if (result.status === "failed") {
      hasFailure = true;
      logUpdate.persist(`  ✗ ${result.dependency} ${result.reason}`);
      continue;
    }

    logUpdate.persist(`  - ${result.dependency} ${result.reason}`);
  }

  if (hasFailure) {
    throw new Error("Package version updates failed.");
  }

  if (!hasUpdate) {
    logUpdate.persist("  ✓ Package versions already up to date");
    return;
  }

  writeFileSync(
    packageJsonPath,
    stringifyPackageJson(packageJsonSource.packageJson, packageJsonSource.source),
  );

  await (options.runInstall ?? runPackageManagerInstall)(packageManager.packageManager, cwd);
  logUpdate.persist(`  ✓ Installed dependencies with ${packageManager.packageManager}`);
}

function detectPackageManager(
  cwd: string,
  packageJson: Pick<PackageJson, "packageManager">,
): PackageManagerDetection {
  const packageManager = readPackageManager(packageJson.packageManager);

  if (packageManager) {
    return { packageManager, source: "packageManager" };
  }

  for (const lockfile of packageManagerLockfiles) {
    if (existsSync(join(cwd, lockfile.fileName))) {
      return {
        packageManager: lockfile.packageManager,
        source: lockfile.fileName,
      };
    }
  }

  return { packageManager: "npm", source: "default" };
}

function updatePackageVersion(
  packageJson: PackageJson,
  update: PackageVersionUpdate,
  versionRange: { from: string; to: string },
): PackageVersionUpdateResult {
  const dependency = findDependency(packageJson, update.dependency);

  if (!dependency) {
    return {
      status: "unchanged",
      dependency: update.dependency,
      reason: "not found",
    };
  }

  const currentVersion = dependency.dependencies[update.dependency];

  if (typeof currentVersion !== "string" || !currentVersion.trim()) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: "has no string version range",
    };
  }

  const targetVersion = versionRange.to.trim();

  if (!targetVersion) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: "has invalid target range",
    };
  }

  if (currentVersion.trim() === targetVersion) {
    return {
      status: "unchanged",
      dependency: update.dependency,
      reason: `already uses ${targetVersion}`,
    };
  }

  const expectedRange = semver.validRange(versionRange.from, { includePrerelease: true });

  if (!expectedRange) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: `has invalid source range ${versionRange.from}`,
    };
  }

  const normalizedCurrentRange = normalizeDependencyRange(currentVersion);

  if (!normalizedCurrentRange) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: `uses ${currentVersion}, which could not be verified automatically`,
    };
  }

  const targetRange = semver.validRange(targetVersion, { includePrerelease: true });

  if (
    targetRange &&
    semver.subset(normalizedCurrentRange, targetRange, { includePrerelease: true })
  ) {
    return {
      status: "unchanged",
      dependency: update.dependency,
      reason: `already satisfies ${targetVersion}`,
    };
  }

  if (
    !semver.intersects(normalizedCurrentRange, expectedRange, {
      includePrerelease: true,
    })
  ) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: `expected ${versionRange.from}, current ${currentVersion}`,
    };
  }

  const nextVersion = getNextDependencyVersion(currentVersion, targetVersion);

  if (!nextVersion) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: `cannot preserve protocol for target ${targetVersion}`,
    };
  }

  dependency.dependencies[update.dependency] = nextVersion;

  return {
    status: "updated",
    dependency: update.dependency,
    field: dependency.field,
    currentVersion,
    nextVersion,
  };
}

function readPackageJsonSource(
  packageJsonPath: string,
): { packageJson: PackageJson; source: string } | null {
  try {
    const source = readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(source) as PackageJson;

    return { packageJson, source };
  } catch {
    return null;
  }
}

function readPackageManager(value: unknown): PackageManager | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(npm|pnpm|yarn|bun)@/);

  return match ? (match[1] as PackageManager) : null;
}

function findDependency(
  packageJson: PackageJson,
  dependency: string,
): { field: DependencyField; dependencies: Record<string, unknown> } | null {
  for (const field of dependencyFields) {
    const dependencies = readRecord(packageJson[field]);

    if (dependencies && Object.hasOwn(dependencies, dependency)) {
      return { field, dependencies };
    }
  }

  return null;
}

function normalizeDependencyRange(version: string): string | null {
  const normalizedVersion = version.startsWith("workspace:")
    ? version.slice("workspace:".length)
    : version;

  if (
    normalizedVersion === "*" ||
    normalizedVersion === "" ||
    normalizedVersion.startsWith("catalog:")
  ) {
    return null;
  }

  return semver.validRange(normalizedVersion, { includePrerelease: true });
}

function getNextDependencyVersion(currentVersion: string, targetVersion: string): string | null {
  if (!currentVersion.startsWith("workspace:")) {
    return targetVersion;
  }

  return semver.validRange(targetVersion, { includePrerelease: true })
    ? `workspace:${targetVersion}`
    : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringifyPackageJson(packageJson: PackageJson, originalSource: string): string {
  const indent = detectJsonIndent(originalSource);
  const newline = originalSource.endsWith("\n") ? "\n" : "";

  return `${JSON.stringify(packageJson, null, indent)}${newline}`;
}

function detectJsonIndent(source: string): string | number {
  const match = source.match(/\n([ \t]+)"/);

  return match?.[1] ?? 2;
}

async function runPackageManagerInstall(packageManager: PackageManager, cwd: string) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(packageManager, ["install"], {
      cwd,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to run ${packageManager} install: ${error.message}`));
    });

    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${packageManager} install exited with code ${exitCode ?? "unknown"}`));
    });
  });
}

export { detectPackageManager, packageVersionTask };
export type { PackageManager, RunPackageManagerInstall };
