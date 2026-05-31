import { readFileSync } from "node:fs";
import type { ApiChange } from "migration-kit";
import {
  addPackageRangeReason,
  dependencyFields,
  readStringRecord,
  vitestFamilyPackages,
  type JsonObject,
} from "../utils/package-json.js";

const reviewDependencyPackageChanges: ApiChange = {
  title: "Review Vitest dependency package changes",
  description:
    "Flags removed packages and package ranges that could not be verified automatically.",
  policy: "advisory",
  files: ["package.json"],
  shouldBlock: packageJsonReviewBlocker,
};

function packageJsonReviewBlocker(filePath: string) {
  const source = readFileSync(filePath, "utf8");

  try {
    return toBlockResult(collectPackageJsonReviewReasons(JSON.parse(source) as JsonObject));
  } catch {
    return { reason: "package.json could not be parsed; dependency migration was skipped." };
  }
}

function collectPackageJsonReviewReasons(packageJson: JsonObject): string[] {
  const reasons: string[] = [];

  for (const field of dependencyFields) {
    const dependencies = readStringRecord(packageJson[field]);

    if (!dependencies) {
      continue;
    }

    for (const packageName of vitestFamilyPackages) {
      addPackageRangeReason(reasons, dependencies, packageName, ">=4.0.0 <5.0.0");
    }

    addIf(
      reasons,
      Boolean(dependencies["@vitest/browser"]),
      `${field} contains @vitest/browser; Vitest 4 no longer needs this package after browser imports are migrated.`,
    );
    addIf(
      reasons,
      Boolean(dependencies["vite-node"]),
      `${field} contains vite-node; Vitest 4 no longer depends on vite-node, so direct usage needs review.`,
    );
  }

  return reasons;
}

function addIf(reasons: string[], condition: boolean, reason: string) {
  if (condition) {
    reasons.push(reason);
  }
}

function toBlockResult(reasons: string[]) {
  if (reasons.length === 0) {
    return false;
  }

  return { reason: reasons.join(" ") };
}

export {
  collectPackageJsonReviewReasons,
  packageJsonReviewBlocker,
  reviewDependencyPackageChanges,
};
