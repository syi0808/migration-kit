export interface MigrationRunnerOptions {
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

export type EnvironmentAvailableStatus = boolean;

export type EnvironmentRequirementCheck = () => EnvironmentAvailableStatus;

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

export type TransformedCode = string;
export type Transformer = (filePath: string) => TransformedCode;
