import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvironmentRequirementCheck, RuntimeRequirementOptions } from "../types.js";
import semver from "semver";

const SEMVER_PATTERN = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const SEMVER_OPTIONS = { includePrerelease: true, loose: true };
const TOOL_VERSION_NAMES: Record<string, string[]> = {
  bun: ["bun"],
  deno: ["deno"],
  node: ["node", "nodejs"],
};
const VERSION_FILES: Record<string, string[]> = {
  bun: [".bun-version"],
  deno: [".deno-version"],
  node: [".nvmrc", ".node-version"],
};

type PackageJson = {
  devEngines?: unknown;
  engines?: Record<string, unknown>;
  packageManager?: unknown;
  volta?: Record<string, unknown>;
};

type ProjectRuntimeRequirement = {
  source: string;
  version: string;
};

function createRuntimeCheck(
  runtimeName: string,
  defaultCommand: string,
  options: RuntimeRequirementOptions = {},
): EnvironmentRequirementCheck {
  const { version, command = defaultCommand, cwd = process.cwd() } = options;

  if (version && !semver.validRange(version)) {
    throw new Error(`Invalid ${runtimeName} version range: ${version}`);
  }

  const label = version ? `${runtimeName} ${version}` : runtimeName;
  const check: EnvironmentRequirementCheck = () => {
    const projectRequirement = readProjectRuntimeRequirement(runtimeName, cwd);

    if (projectRequirement) {
      if (!version) {
        return true;
      }

      const projectRequirementStatus = checkConfiguredRuntimeVersion(
        projectRequirement.version,
        version,
      );

      if (projectRequirementStatus !== null) {
        return projectRequirementStatus;
      }
    }

    const currentVersion = readRuntimeVersion(command);

    if (!currentVersion) {
      return false;
    }

    if (!version) {
      return true;
    }

    return semver.satisfies(currentVersion, version, { includePrerelease: true });
  };

  check.label = label;
  check.successMessage = version ? `${label} satisfied` : `${label} available`;
  check.failureMessage = version ? `${label} required` : `${label} unavailable`;

  return check;
}

function readProjectRuntimeRequirement(
  runtimeName: string,
  cwd: string,
): ProjectRuntimeRequirement | null {
  const packageJsonRequirement = readPackageJsonRuntimeRequirement(runtimeName, cwd);

  if (packageJsonRequirement) {
    return packageJsonRequirement;
  }

  const versionFileRequirement = readVersionFileRuntimeRequirement(runtimeName, cwd);

  if (versionFileRequirement) {
    return versionFileRequirement;
  }

  return readToolVersionsRuntimeRequirement(runtimeName, cwd);
}

function readPackageJsonRuntimeRequirement(
  runtimeName: string,
  cwd: string,
): ProjectRuntimeRequirement | null {
  const packageJson = readPackageJson(cwd);

  if (!packageJson) {
    return null;
  }

  const voltaVersion = readRecordString(packageJson.volta, runtimeName);

  if (voltaVersion) {
    return { source: "package.json#volta", version: voltaVersion };
  }

  const devEnginesVersion = readDevEnginesRuntimeVersion(packageJson.devEngines, runtimeName);

  if (devEnginesVersion) {
    return { source: "package.json#devEngines.runtime", version: devEnginesVersion };
  }

  const enginesVersion = readRecordString(packageJson.engines, runtimeName);

  if (enginesVersion) {
    return { source: "package.json#engines", version: enginesVersion };
  }

  const packageManagerVersion = readPackageManagerRuntimeVersion(
    packageJson.packageManager,
    runtimeName,
  );

  if (packageManagerVersion) {
    return { source: "package.json#packageManager", version: packageManagerVersion };
  }

  return null;
}

function readPackageJson(cwd: string): PackageJson | null {
  const packageJsonPath = join(cwd, "package.json");

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function readDevEnginesRuntimeVersion(devEngines: unknown, runtimeName: string): string | null {
  const runtime = toRecord(devEngines)?.runtime;
  const runtimeEntries = Array.isArray(runtime) ? runtime : [runtime];

  for (const runtimeEntry of runtimeEntries) {
    const runtimeRecord = toRecord(runtimeEntry);

    if (!runtimeRecord) {
      continue;
    }

    const name = readString(runtimeRecord.name);
    const version = readString(runtimeRecord.version);

    if (name === runtimeName && version) {
      return version;
    }
  }

  return null;
}

function readPackageManagerRuntimeVersion(
  packageManager: unknown,
  runtimeName: string,
): string | null {
  const packageManagerValue = readString(packageManager);
  const matchedPackageManager = packageManagerValue?.match(/^([^@]+)@(.+)$/);

  if (!matchedPackageManager) {
    return null;
  }

  const [, packageManagerName, packageManagerVersion] = matchedPackageManager;

  if (packageManagerName !== runtimeName) {
    return null;
  }

  return packageManagerVersion ?? null;
}

function readVersionFileRuntimeRequirement(
  runtimeName: string,
  cwd: string,
): ProjectRuntimeRequirement | null {
  for (const fileName of VERSION_FILES[runtimeName] ?? []) {
    const version = readVersionFile(join(cwd, fileName));

    if (version) {
      return { source: fileName, version };
    }
  }

  return null;
}

function readToolVersionsRuntimeRequirement(
  runtimeName: string,
  cwd: string,
): ProjectRuntimeRequirement | null {
  const toolVersionsPath = join(cwd, ".tool-versions");

  if (!existsSync(toolVersionsPath)) {
    return null;
  }

  const toolNames = new Set(TOOL_VERSION_NAMES[runtimeName] ?? [runtimeName]);

  try {
    const lines = readFileSync(toolVersionsPath, "utf8").split(/\r?\n/);

    for (const line of lines) {
      const [toolName, version] = withoutComment(line).split(/\s+/);

      if (toolName && version && toolNames.has(toolName)) {
        return { source: ".tool-versions", version };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function readVersionFile(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const version = withoutComment(line);

      if (version) {
        return version;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function checkConfiguredRuntimeVersion(configuredVersion: string, requiredVersion: string) {
  const configuredRange = semver.validRange(configuredVersion, SEMVER_OPTIONS);

  if (!configuredRange) {
    return null;
  }

  return semver.subset(configuredRange, requiredVersion, SEMVER_OPTIONS);
}

function readRuntimeVersion(command: string): string | null {
  try {
    const output = execFileSync(command, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
      windowsHide: true,
    });

    return parseRuntimeVersion(output);
  } catch {
    return null;
  }
}

function parseRuntimeVersion(output: string): string | null {
  const matchedVersion = output.match(SEMVER_PATTERN)?.[1];
  const version = matchedVersion ?? output;
  const validVersion = semver.valid(version) ?? semver.coerce(version)?.version;

  return validVersion ?? null;
}

function withoutComment(value: string): string {
  return value.split("#")[0]?.trim() ?? "";
}

function readRecordString(record: Record<string, unknown> | undefined, key: string): string | null {
  return readString(record?.[key]);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export { createRuntimeCheck };
