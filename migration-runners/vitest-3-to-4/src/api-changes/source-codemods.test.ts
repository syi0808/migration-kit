import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { moveTestOptions } from "./move-test-options.js";
import { sourceReviewBlocker } from "./review-source-api-changes.js";
import { updateBrowserUtilsImports } from "./update-browser-utils-imports.js";
import { updateCustomEnvironment } from "./update-custom-environment.js";
import { updateDeprecatedTypeImports } from "./update-deprecated-type-imports.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("source API codemods", () => {
  it("moves Vitest options before the test handler and is idempotent", async () => {
    const sourcePath = createSourceFile([
      "import { test } from 'vitest';",
      "",
      "test('works', () => {}, { timeout: 1_000 });",
      "test.concurrent('also works', () => {}, { retry: 2 });",
      "",
    ]);

    const first = await moveTestOptions.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");
    const second = await moveTestOptions.transform?.(sourcePath);

    expect(first).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toContain("test('works', { timeout: 1_000 }, () => {})");
    expect(output).toContain("test.concurrent('also works', { retry: 2 }, () => {})");
    expect(second).toEqual({ status: "unchanged", filePath: sourcePath });
  });

  it("rewrites named @vitest/browser/utils imports through vitest/browser utils", async () => {
    const sourcePath = createSourceFile([
      "import { page } from 'vitest/browser';",
      "import { click, getElementError as getError } from '@vitest/browser/utils';",
      "",
      "await click(page.getByRole('button'));",
      "getError(document.body, 'missing');",
      "",
    ]);

    const result = await updateBrowserUtilsImports.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toContain("import { page, utils } from 'vitest/browser';");
    expect(output).toMatch(/const\s*{\s*click,\s*getElementError: getError\s*}\s*=\s*utils;/);
    expect(output).not.toContain("@vitest/browser/utils");
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });

  it("rewrites namespace @vitest/browser/utils imports to a utils alias", async () => {
    const sourcePath = createSourceFile([
      "import * as browserUtils from '@vitest/browser/utils';",
      "",
      "browserUtils.getElementError(document.body, 'missing');",
      "",
    ]);

    const result = await updateBrowserUtilsImports.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toContain("import { utils as browserUtils } from 'vitest/browser';");
    expect(output).not.toContain("@vitest/browser/utils");
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });

  it("leaves unsupported browser utils import shapes for manual review", async () => {
    const sourcePath = createSourceFile([
      "import browserUtils from '@vitest/browser/utils';",
      "",
      "browserUtils.getElementError(document.body, 'missing');",
      "",
    ]);

    const result = await updateBrowserUtilsImports.transform?.(sourcePath);

    expect(result).toEqual({ status: "unchanged", filePath: sourcePath });
    expect(sourceReviewBlocker(sourcePath)).toEqual({
      kind: "manual-fix",
      reason: "Replace @vitest/browser/utils imports with utilities from vitest/browser.",
    });
  });

  it("rewrites custom environment transformMode values", async () => {
    const sourcePath = createSourceFile([
      "export default {",
      "  name: 'custom',",
      "  transformMode: 'web',",
      "  setup() {",
      "    return { teardown() {} };",
      "  },",
      "};",
      "",
    ]);

    const result = await updateCustomEnvironment.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toMatch(/viteEnvironment:\s*['"]client['"]/);
    expect(output).not.toContain("transformMode");
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });

  it("removes transformMode when viteEnvironment is already present", async () => {
    const sourcePath = createSourceFile([
      "export default {",
      "  name: 'custom',",
      "  viteEnvironment: 'ssr',",
      "  transformMode: 'ssr',",
      "};",
      "",
    ]);

    const result = await updateCustomEnvironment.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toContain("viteEnvironment: 'ssr'");
    expect(output).not.toContain("transformMode");
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });

  it("rewrites removed Vitest type imports and references", async () => {
    const sourcePath = createSourceFile([
      "import type { SpyInstance, WorkspaceSpec } from 'vitest';",
      "",
      "type LegacySpy = SpyInstance;",
      "type LegacyWorkspaceSpec = WorkspaceSpec;",
      "",
    ]);

    const result = await updateDeprecatedTypeImports.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toMatch(typeImportPattern("MockInstance", "vitest"));
    expect(output).toMatch(typeImportPattern("TestSpecification", "vitest/node"));
    expect(output).toContain("type LegacySpy = MockInstance;");
    expect(output).toContain("type LegacyWorkspaceSpec = TestSpecification;");
    expect(output).not.toMatch(/\bSpyInstance\b/);
    expect(output).not.toMatch(/\bWorkspaceSpec\b/);
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });

  it("preserves local aliases for removed Vitest type imports", async () => {
    const sourcePath = createSourceFile([
      "import type { SpyInstance as LegacySpy } from 'vitest';",
      "",
      "type TestSpy = LegacySpy;",
      "",
    ]);

    const result = await updateDeprecatedTypeImports.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toMatch(typeImportPattern("MockInstance as LegacySpy", "vitest"));
    expect(output).toContain("type TestSpy = LegacySpy;");
    expect(output).not.toContain("SpyInstance");
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });

  it("keeps mixed Vitest value imports while marking replaced type specifiers", async () => {
    const sourcePath = createSourceFile([
      "import { describe, SpyInstance } from 'vitest';",
      "",
      "type TestSpy = SpyInstance;",
      "describe('suite', () => {});",
      "",
    ]);

    const result = await updateDeprecatedTypeImports.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toMatch(typeImportPattern("MockInstance", "vitest"));
    expect(output).toMatch(/import\s+\{\s*describe\s*\}\s+from\s+['"]vitest['"]/);
    expect(output).toContain("type TestSpy = MockInstance;");
    expect(output).not.toMatch(/\bSpyInstance\b/);
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });

  it("rewrites WorkspaceSpec imports from vitest/node in place", async () => {
    const sourcePath = createSourceFile([
      "import type { WorkspaceSpec } from 'vitest/node';",
      "",
      "type LegacyWorkspaceSpec = WorkspaceSpec;",
      "",
    ]);

    const result = await updateDeprecatedTypeImports.transform?.(sourcePath);
    const output = readFileSync(sourcePath, "utf8");

    expect(result).toEqual({ status: "updated", filePath: sourcePath });
    expect(output).toMatch(typeImportPattern("TestSpecification", "vitest/node"));
    expect(output).toContain("type LegacyWorkspaceSpec = TestSpecification;");
    expect(output).not.toMatch(/\bWorkspaceSpec\b/);
    expect(sourceReviewBlocker(sourcePath)).toBe(false);
  });
});

function createSourceFile(lines: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-source-codemods-"));
  const sourcePath = join(directory, "example.test.ts");

  tempDirectories.push(directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(sourcePath, lines.join("\n"));

  return sourcePath;
}

function typeImportPattern(specifier: string, source: string): RegExp {
  return new RegExp(
    `import\\s+(?:type\\s+)?\\{\\s*(?:type\\s+)?${escapeRegExp(specifier)}\\s*\\}\\s+from\\s+['"]${escapeRegExp(source)}['"]`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
