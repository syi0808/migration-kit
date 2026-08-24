type DependencyField =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type PackageJson = {
  packageManager?: unknown;
} & {
  [field in DependencyField]?: Record<string, unknown>;
};

type PackageVersionTaskOptions = {
  cwd?: string;
  runInstall?: RunPackageManagerInstall;
  resolvePackageVersion?: ResolvePackageVersion;
};

type InstallOutputHandler = (chunk: string) => void;

type RunPackageManagerInstall = (
  packageManager: PackageManager,
  cwd: string,
  onOutput?: InstallOutputHandler,
) => Promise<void>;

type ResolvePackageVersion = (dependency: string, versionRange: string) => Promise<string | null>;

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

type PackageJsonSource = {
  packageJson: PackageJson;
  source: string;
};

type DependencyMatch = {
  field: DependencyField;
  dependencies: Record<string, unknown>;
};

type InstallOutputPreviewState = {
  lines: string[];
  currentLine: string;
};

type InstallOutputPreview = {
  append(chunk: string): void;
  clear(): void;
  render(): void;
};

export type {
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
};
