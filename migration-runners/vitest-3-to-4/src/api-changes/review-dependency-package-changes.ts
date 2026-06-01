import { readMigrationFileSync, type ApiChange } from "migration-kit";
import {
  dependencyFields,
  getPackageRangeReviewFinding,
  readStringRecord,
  vitestFamilyPackages,
  type JsonObject,
} from "../utils/package-json.js";

type PackageJsonReviewFinding = {
  kind: "manual-fix" | "manual-confirmation";
  reason: string;
};

const reviewDependencyPackageChanges: ApiChange = {
  title: "Review Vitest dependency package changes",
  description:
    "Flags removed packages and package ranges that could not be verified automatically.",
  policy: "blocking",
  files: ["package.json"],
  shouldBlock: packageJsonReviewBlocker as NonNullable<ApiChange["shouldBlock"]>,
};

function packageJsonReviewBlocker(filePath: string) {
  const source = readMigrationFileSync(filePath);

  try {
    return toBlockResult(collectPackageJsonReviewFindings(JSON.parse(source) as JsonObject));
  } catch {
    return { reason: "package.json could not be parsed; dependency migration was skipped." };
  }
}

function collectPackageJsonReviewReasons(packageJson: JsonObject): string[] {
  return collectPackageJsonReviewFindings(packageJson).map((finding) => finding.reason);
}

function collectPackageJsonReviewFindings(packageJson: JsonObject): PackageJsonReviewFinding[] {
  const findings: PackageJsonReviewFinding[] = [];

  for (const field of dependencyFields) {
    const dependencies = readStringRecord(packageJson[field]);

    if (!dependencies) {
      continue;
    }

    for (const packageName of vitestFamilyPackages) {
      addFindingIfPresent(
        findings,
        getPackageRangeReviewFinding(dependencies, packageName, ">=4.0.0 <5.0.0"),
      );
    }

    addManualFixIf(
      findings,
      Boolean(dependencies["@vitest/browser"]),
      `${field} contains @vitest/browser; Vitest 4 no longer needs this package after browser imports are migrated.`,
    );
    addManualConfirmationIf(
      findings,
      Boolean(dependencies["vite-node"]),
      `${field} contains vite-node; Vitest 4 no longer depends on vite-node, so direct usage needs review.`,
    );
  }

  return findings;
}

function addFindingIfPresent(
  findings: PackageJsonReviewFinding[],
  finding: PackageJsonReviewFinding | null,
) {
  if (finding) {
    findings.push(finding);
  }
}

function addManualFixIf(findings: PackageJsonReviewFinding[], condition: boolean, reason: string) {
  if (condition) {
    findings.push({ kind: "manual-fix", reason });
  }
}

function addManualConfirmationIf(
  findings: PackageJsonReviewFinding[],
  condition: boolean,
  reason: string,
) {
  if (condition) {
    findings.push({ kind: "manual-confirmation", reason });
  }
}

function toBlockResult(findings: PackageJsonReviewFinding[]) {
  if (findings.length === 0) {
    return false;
  }

  return findings.length === 1 ? findings[0] : findings;
}

export {
  collectPackageJsonReviewFindings,
  collectPackageJsonReviewReasons,
  packageJsonReviewBlocker,
  reviewDependencyPackageChanges,
};
