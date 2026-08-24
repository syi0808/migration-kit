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

type RuntimeVersionLookup =
  | {
      evidence: string;
      status: "found";
      version: string;
    }
  | {
      evidence: string;
      status: "missing";
    };

export type { PackageJson, ProjectRuntimeRequirement, RuntimeVersionLookup };
