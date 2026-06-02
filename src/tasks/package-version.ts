import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { get } from "node:https";
import { join } from "node:path";
import semver from "semver";
import type { ResolvedPackageVersionUpdate } from "../types.js";
import { logStyle, stripAnsi } from "../utils/log-style.js";
import type { MigrationRenderer } from "../utils/renderer.js";
import type {
  DependencyField,
  DependencyMatch,
  InstallOutputHandler,
  InstallOutputPreview,
  InstallOutputPreviewState,
  PackageJson,
  PackageJsonSource,
  PackageManager,
  PackageManagerDetection,
  PackageVersionTaskOptions,
  PackageVersionUpdateResult,
  ResolvePackageVersion,
  RunPackageManagerInstall,
} from "./package-version.types.js";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] satisfies readonly DependencyField[];

const packageManagerLockfiles = [
  { fileName: "pnpm-lock.yaml", packageManager: "pnpm" },
  { fileName: "yarn.lock", packageManager: "yarn" },
  { fileName: "package-lock.json", packageManager: "npm" },
  { fileName: "npm-shrinkwrap.json", packageManager: "npm" },
  { fileName: "bun.lock", packageManager: "bun" },
  { fileName: "bun.lockb", packageManager: "bun" },
] satisfies ReadonlyArray<{ fileName: string; packageManager: PackageManager }>;

async function packageVersionTask(
  renderer: MigrationRenderer,
  updates: ResolvedPackageVersionUpdate[],
  options: PackageVersionTaskOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const packageJsonPath = join(cwd, "package.json");
  const packageJsonSource = readPackageJsonSource(packageJsonPath);

  if (!packageJsonSource) {
    throw new Error("package.json not found or invalid.");
  }

  const packageManager = detectPackageManager(cwd, packageJsonSource.packageJson);
  let hasFailure = false;
  let hasUpdate = false;

  renderer.info(
    `Detected ${packageManager.packageManager} package manager (${packageManager.source})`,
  );

  for (const update of updates) {
    const result = await updatePackageVersion(
      packageJsonSource.packageJson,
      update,
      { from: update.from, to: update.to },
      options.resolvePackageVersion ?? resolveLatestPackageVersion,
    );

    if (result.status === "updated") {
      hasUpdate = true;
      renderer.success(
        `${result.dependency} ${result.currentVersion} → ${result.nextVersion} (${result.field})`,
      );
      continue;
    }

    if (result.status === "failed") {
      hasFailure = true;
      renderer.error(`${result.dependency} ${result.reason}`);
      continue;
    }

    renderer.skipped(`${result.dependency} ${result.reason}`);
  }

  if (hasFailure) {
    throw new Error("Package version updates failed.");
  }

  if (!hasUpdate) {
    renderer.success("Package versions already up to date");
    return;
  }

  writeFileSync(
    packageJsonPath,
    stringifyPackageJson(packageJsonSource.packageJson, packageJsonSource.source),
  );

  const installOutputPreview = createInstallOutputPreview(renderer, packageManager.packageManager);

  installOutputPreview.render();

  try {
    await (options.runInstall ?? runPackageManagerInstall)(
      packageManager.packageManager,
      cwd,
      installOutputPreview.append,
    );
  } finally {
    installOutputPreview.clear();
  }

  renderer.success(`Dependencies installed with ${packageManager.packageManager}`);
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

async function updatePackageVersion(
  packageJson: PackageJson,
  update: ResolvedPackageVersionUpdate,
  versionRange: { from: string; to: string },
  resolvePackageVersion: ResolvePackageVersion,
): Promise<PackageVersionUpdateResult> {
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

  const requestedTargetVersion = versionRange.to.trim();

  if (!requestedTargetVersion) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: "has invalid target range",
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

  const requestedTargetRange = semver.validRange(requestedTargetVersion, {
    includePrerelease: true,
  });
  const resolvedTargetVersion = await resolveTargetVersion(
    update.dependency,
    requestedTargetVersion,
    resolvePackageVersion,
  ).catch(() => null);

  if (!resolvedTargetVersion) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: `could not resolve target ${requestedTargetVersion}`,
    };
  }

  const targetVersion = resolvedTargetVersion;

  const nextVersion = getNextDependencyVersion(currentVersion, targetVersion);

  if (!nextVersion) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: `cannot preserve protocol for target ${targetVersion}`,
    };
  }

  if (currentVersion.trim() === nextVersion) {
    return {
      status: "unchanged",
      dependency: update.dependency,
      reason: `already uses ${targetVersion}`,
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

  const currentIsInSourceRange = semver.intersects(normalizedCurrentRange, expectedRange, {
    includePrerelease: true,
  });
  const currentIsInRequestedTargetRange = requestedTargetRange
    ? semver.intersects(normalizedCurrentRange, requestedTargetRange, {
        includePrerelease: true,
      })
    : false;

  if (!currentIsInSourceRange && !currentIsInRequestedTargetRange) {
    return {
      status: "failed",
      dependency: update.dependency,
      reason: `expected ${versionRange.from}, current ${currentVersion}`,
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

async function resolveTargetVersion(
  dependency: string,
  targetVersion: string,
  resolvePackageVersion: ResolvePackageVersion,
): Promise<string | null> {
  if (!shouldResolveLatestVersion(targetVersion)) {
    return targetVersion;
  }

  return resolvePackageVersion(dependency, targetVersion);
}

function shouldResolveLatestVersion(targetVersion: string): boolean {
  if (!semver.validRange(targetVersion, { includePrerelease: true })) {
    return false;
  }

  if (semver.valid(targetVersion)) {
    return false;
  }

  return /^(?:v?\d+|v?\d+\.\d+|v?\d+\.(?:x|X|\*)|v?\d+\.\d+\.(?:x|X|\*)|x|X|\*)$/.test(
    targetVersion.trim(),
  );
}

async function resolveLatestPackageVersion(
  dependency: string,
  versionRange: string,
): Promise<string | null> {
  const metadata = await readPackageMetadata(dependency);
  const versions = readRecord(metadata.versions);

  if (!versions) {
    return null;
  }

  return semver.maxSatisfying(Object.keys(versions), versionRange, {
    includePrerelease: versionRange.includes("-"),
  });
}

async function readPackageMetadata(dependency: string): Promise<Record<string, unknown>> {
  const registry =
    process.env.npm_config_registry ??
    process.env.NPM_CONFIG_REGISTRY ??
    "https://registry.npmjs.org/";
  const registryUrl = new URL(registry.endsWith("/") ? registry : `${registry}/`);
  const metadataUrl = new URL(encodeURIComponent(dependency), registryUrl);

  return await new Promise<Record<string, unknown>>((resolvePromise, reject): void => {
    const request = (metadataUrl.protocol === "http:" ? httpGet : get)(
      metadataUrl,
      (response): void => {
        if (response.statusCode === 404) {
          response.resume();
          resolvePromise({});
          return;
        }

        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`Failed to fetch ${dependency} metadata: HTTP ${response.statusCode}`));
          return;
        }

        let source = "";

        response.setEncoding("utf8");
        response.on("data", (chunk): void => {
          source += chunk;
        });
        response.on("end", (): void => {
          try {
            resolvePromise(JSON.parse(source) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.setTimeout(30_000, (): void => {
      request.destroy(new Error(`Timed out fetching ${dependency} metadata`));
    });
  });
}

function readPackageJsonSource(packageJsonPath: string): PackageJsonSource | null {
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

function findDependency(packageJson: PackageJson, dependency: string): DependencyMatch | null {
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

function createInstallOutputPreview(
  renderer: MigrationRenderer,
  packageManager: PackageManager,
): InstallOutputPreview {
  const state: InstallOutputPreviewState = {
    lines: [],
    currentLine: "",
  };

  const render = (): void => {
    const outputLines = readInstallOutputPreviewLines(state);
    const message = [
      logStyle.info(`Installing dependencies with ${packageManager}...`),
      ...outputLines.map((line) => logStyle.detail(line, 2)),
    ].join("\n");

    renderer.live(message);
  };

  return {
    append(chunk: string): void {
      appendInstallOutputChunk(state, chunk);
      render();
    },
    clear(): void {
      renderer.clear();
    },
    render,
  };
}

/**
 * Maintains a rolling preview of package-manager output without persisting noisy install logs.
 */
function appendInstallOutputChunk(state: InstallOutputPreviewState, chunk: string): void {
  for (const character of chunk) {
    if (character === "\n" || character === "\r") {
      pushInstallOutputLine(state, state.currentLine);
      state.currentLine = "";
      continue;
    }

    state.currentLine += character;
  }
}

function pushInstallOutputLine(state: InstallOutputPreviewState, line: string): void {
  const normalizedLine = normalizeInstallOutputLine(line);

  if (!normalizedLine) {
    return;
  }

  state.lines.push(normalizedLine);

  if (state.lines.length > 4) {
    state.lines.splice(0, state.lines.length - 4);
  }
}

function readInstallOutputPreviewLines(state: InstallOutputPreviewState): string[] {
  const currentLine = normalizeInstallOutputLine(state.currentLine);
  const lines = currentLine ? [...state.lines, currentLine] : state.lines;

  return lines.slice(-4);
}

function normalizeInstallOutputLine(line: string): string | null {
  const normalizedLine = stripAnsi(line).trimEnd();

  return normalizedLine.trim() ? normalizedLine : null;
}

async function runPackageManagerInstall(
  packageManager: PackageManager,
  cwd: string,
  onOutput?: InstallOutputHandler,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject): void => {
    const child = spawn(packageManager, ["install"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (onOutput) {
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", onOutput);
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", onOutput);
    }

    child.on("error", (error): void => {
      reject(new Error(`Failed to run ${packageManager} install: ${error.message}`));
    });

    child.on("close", (exitCode): void => {
      if (exitCode === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${packageManager} install exited with code ${exitCode ?? "unknown"}`));
    });
  });
}

export { detectPackageManager, packageVersionTask };
export type { PackageManager, ResolvePackageVersion, RunPackageManagerInstall };
