import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateVitestDependencyRanges } from "./update-vitest-dependencies.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("updateVitestDependencyRanges", () => {
  it("updates Vitest family packages without changing Vite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-deps-"));
    const packageJsonPath = join(directory, "package.json");

    tempDirectories.push(directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify(
        {
          devDependencies: {
            vitest: "^3.2.0",
            "@vitest/ui": "^3.2.0",
            vite: "^5.4.0",
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = await updateVitestDependencyRanges.transform?.(packageJsonPath);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    expect(result).toEqual({ status: "updated", filePath: packageJsonPath });
    expect(packageJson.devDependencies).toEqual({
      vitest: "^4.0.0",
      "@vitest/ui": "^4.0.0",
      vite: "^5.4.0",
    });
  });
});
