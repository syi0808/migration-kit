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

export type { DependencyCheckResult, PackageJson };
