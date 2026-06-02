export type MigrationRunnerOptions =
  | {
      name: string;
      from: string;
      to: string;
      docs?: string;
      configPath?: string[];
      environment?: EnvironmentRequirementCheck[];
      peerDependencies?: PeerDependency[];
      packageVersionUpdates?: PackageVersionUpdate[];
      configChanges?: ConfigChange[];
      apiChanges?: ApiChange[];
    }
  | {
      name: string;
      from: string;
      to: string;
      docs?: string;
      configPath: string[];
      environment?: EnvironmentRequirementCheck[];
      peerDependencies?: PeerDependency[];
      packageVersionUpdates?: PackageVersionUpdate[];
      configChanges: ConfigChange[];
      apiChanges?: ApiChange[];
    };

export interface ResolvedMigrationRunnerOptions {
  name: string;
  from: string;
  to: string;
  docs?: string;
  configPath: string[];
  environment: EnvironmentRequirementCheck[];
  peerDependencies: PeerDependency[];
  packageVersionUpdates: ResolvedPackageVersionUpdate[];
  configChanges: ResolvedConfigChange[];
  apiChanges: ResolvedApiChange[];
}

export type EnvironmentAvailableStatus = boolean;

export type EnvironmentRequirementResult =
  | EnvironmentAvailableStatus
  | {
      available: EnvironmentAvailableStatus;
      evidence?: string[];
      message?: string;
    };

export type EnvironmentRequirementCheck = (() =>
  | EnvironmentRequirementResult
  | Promise<EnvironmentRequirementResult>) & {
  label?: string;
  successMessage?: string;
  failureMessage?: string;
};

export interface RuntimeRequirementOptions {
  version?: string;
  command?: string;
  cwd?: string;
}

export interface PeerDependency {
  dependency: string;
  requiredVersion: string;
}

export interface PackageVersionUpdate {
  dependency: string;
  from?: string;
  to?: string;
}

export type ResolvedPackageVersionUpdate = Omit<PackageVersionUpdate, "from" | "to"> & {
  from: string;
  to: string;
};

export type BlockPolicy = "blocking" | "advisory";
export type BlockKind = "manual-fix" | "manual-confirmation";

export type ManualFixBlock = {
  kind?: "manual-fix";
  reason: string;
};

export type ManualConfirmationBlock = {
  kind: "manual-confirmation";
  reason: string;
  prompt?: string;
};

export type BlockFinding = ManualFixBlock | ManualConfirmationBlock;
export type BlockCheckResult = false | BlockFinding | BlockFinding[];

export interface ConfigChange {
  title: string;
  description?: string;
  policy?: BlockPolicy;
  shouldBlock?: (configPath: string) => BlockCheckResult;
  transform?: Transformer;
}

export type ResolvedConfigChange = Omit<ConfigChange, "policy"> & {
  policy: BlockPolicy;
};

export interface ApiChange {
  title: string;
  description?: string;
  policy?: BlockPolicy;
  files: string[];
  shouldBlock?: (filePath: string) => BlockCheckResult;
  transform?: Transformer;
}

export type ResolvedApiChange = Omit<ApiChange, "policy"> & {
  policy: BlockPolicy;
};

export type TransformResult =
  | { status: "updated"; filePath: string }
  | { status: "unchanged"; filePath: string }
  | { status: "needs-review"; filePath: string; reason: string }
  | { status: "failed"; filePath: string; reason: string };
export type Transformer = (filePath: string) => Promise<TransformResult> | TransformResult;
