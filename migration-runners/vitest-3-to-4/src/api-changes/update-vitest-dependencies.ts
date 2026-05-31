import { readFile, writeFile } from "node:fs/promises";
import type { ApiChange, Transformer } from "migration-kit";
import {
  dependencyFields,
  readStringRecord,
  stringifyPackageJson,
  updateDependencyRange,
  vitestFamilyPackages,
  type JsonObject,
} from "../utils/package-json.js";
import { formatError } from "../utils/text-transform.js";

const updateVitestDependencyRanges: ApiChange = {
  title: "Update Vitest package ranges in package.json",
  description:
    "Moves Vitest family packages to v4 ranges. Vite is intentionally not changed here; it is checked as a peer dependency requirement.",
  files: ["package.json"],
  transform: createPackageJsonDependencyTransform(),
};

function createPackageJsonDependencyTransform(): Transformer {
  return async (filePath) => {
    try {
      const source = await readFile(filePath, "utf8");
      const packageJson = JSON.parse(source) as JsonObject;
      let changed = false;

      for (const field of dependencyFields) {
        const dependencies = readStringRecord(packageJson[field]);

        if (!dependencies) {
          continue;
        }

        for (const packageName of vitestFamilyPackages) {
          changed =
            updateDependencyRange(dependencies, packageName, "^4.0.0", ">=4.0.0 <5.0.0") || changed;
        }
      }

      if (!changed) {
        return { status: "unchanged", filePath };
      }

      await writeFile(filePath, stringifyPackageJson(packageJson, source));

      return { status: "updated", filePath };
    } catch (error) {
      return { status: "failed", filePath, reason: formatError(error) };
    }
  };
}

export { createPackageJsonDependencyTransform, updateVitestDependencyRanges };
