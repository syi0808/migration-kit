import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectPackageJsonReviewFindings,
  packageJsonReviewBlocker,
} from "./review-dependency-package-changes.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("collectPackageJsonReviewFindings", () => {
  it("marks unverified Vitest package ranges as manual confirmations", () => {
    const findings = collectPackageJsonReviewFindings({
      devDependencies: {
        vitest: "catalog:",
      },
    });

    expect(findings).toEqual([
      {
        kind: "manual-confirmation",
        reason: "vitest uses catalog:, which could not be verified automatically.",
      },
    ]);
  });

  it("marks vite-node direct dependency review as manual confirmation", () => {
    const findings = collectPackageJsonReviewFindings({
      devDependencies: {
        "vite-node": "^3.2.0",
      },
    });

    expect(findings).toEqual([
      {
        kind: "manual-confirmation",
        reason:
          "devDependencies contains vite-node; Vitest 4 no longer depends on vite-node, so direct usage needs review.",
      },
    ]);
  });

  it("keeps removed @vitest/browser package as a manual fix", () => {
    const findings = collectPackageJsonReviewFindings({
      devDependencies: {
        "@vitest/browser": "^3.2.0",
      },
    });

    expect(findings).toEqual([
      {
        kind: "manual-fix",
        reason:
          "devDependencies contains @vitest/browser; Vitest 4 no longer needs this package after browser imports are migrated.",
      },
    ]);
  });

  it("keeps outdated Vitest package ranges as manual fixes", () => {
    const findings = collectPackageJsonReviewFindings({
      devDependencies: {
        vitest: "^3.2.0",
      },
    });

    expect(findings).toEqual([
      {
        kind: "manual-fix",
        reason: "vitest should satisfy >=4.0.0 <5.0.0; current range is ^3.2.0.",
      },
    ]);
  });

  it("returns separate confirmation findings when package items only need review", () => {
    const packageJsonPath = createPackageJson({
      devDependencies: {
        vitest: "catalog:",
        "vite-node": "^3.2.0",
      },
    });

    expect(packageJsonReviewBlocker(packageJsonPath)).toEqual([
      {
        kind: "manual-confirmation",
        reason: "vitest uses catalog:, which could not be verified automatically.",
      },
      {
        kind: "manual-confirmation",
        reason:
          "devDependencies contains vite-node; Vitest 4 no longer depends on vite-node, so direct usage needs review.",
      },
    ]);
  });

  it("returns separate mixed findings when some package items need a file change", () => {
    const packageJsonPath = createPackageJson({
      devDependencies: {
        "@vitest/browser": "^3.2.0",
        "vite-node": "^3.2.0",
      },
    });

    expect(packageJsonReviewBlocker(packageJsonPath)).toEqual([
      {
        kind: "manual-fix",
        reason:
          "devDependencies contains @vitest/browser; Vitest 4 no longer needs this package after browser imports are migrated.",
      },
      {
        kind: "manual-confirmation",
        reason:
          "devDependencies contains vite-node; Vitest 4 no longer depends on vite-node, so direct usage needs review.",
      },
    ]);
  });
});

function createPackageJson(packageJson: Record<string, unknown>): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-dependency-review-"));
  const packageJsonPath = join(directory, "package.json");

  tempDirectories.push(directory);
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  return packageJsonPath;
}
