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

export type EnvironmentAvailableStatus = boolean;

export type EnvironmentRequirementResult =
  | EnvironmentAvailableStatus
  | {
      available: EnvironmentAvailableStatus;
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

export type BlockPolicy = "blocking" | "advisory";

export interface ConfigChange {
  title: string;
  description?: string;
  policy?: BlockPolicy;
  shouldBlock?: (configPath: string) => false | { reason: string };
  transform?: Transformer;
}

export interface ApiChange {
  title: string;
  description?: string;
  policy?: BlockPolicy;
  files: string[];
  shouldBlock?: (filePath: string) => false | { reason: string };
  transform?: Transformer;
}

export type TransformResult =
  | { status: "updated"; filePath: string }
  | { status: "unchanged"; filePath: string }
  | { status: "needs-review"; filePath: string; reason: string }
  | { status: "failed"; filePath: string; reason: string };
export type Transformer = (filePath: string) => Promise<TransformResult> | TransformResult;
