type DeprecatedTypeReplacement = {
  name: string;
  module: "vitest" | "vitest/node";
};

type ImportToAdd = {
  importedName: string;
  localName: string;
  moduleName: "vitest" | "vitest/node";
};

export type { DeprecatedTypeReplacement, ImportToAdd };
