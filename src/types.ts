export type MigrationRunnerOptions =
  | {
      name: string;
      from: string;
      to: string;
      docs?: string;
      configPath?: string[];
      environment?: EnvironmentRequirementCheck[];
      peerDependencies?: PeerDependency[];
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

export interface ConfigChange {
  title: string;
  description?: string;
  level: "error" | "warning";
  shouldBlock?: (configPath: string) => false | { reason: string };
  transform?: Transformer;
}

export interface ApiChange {
  title: string;
  description?: string;
  files: string[];
  shouldBlock?: (configPath: string) => false | { reason: string };
  transform?: Transformer;
}

export type TransformResult =
  | { status: "updated"; filePath: string }
  | { status: "unchanged"; filePath: string }
  | { status: "needs-review"; filePath: string; reason: string }
  | { status: "failed"; filePath: string; reason: string };
export type Transformer = (filePath: string) => Promise<TransformResult> | TransformResult;
