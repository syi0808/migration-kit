import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { transformer } from "./transformer.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("transformer.jscodeshift", () => {
  it("writes changed source and reports an updated result", async () => {
    const filePath = createFile("example.ts", "const oldName = 1;\nconsole.log(oldName);\n");
    const transform = transformer.jscodeshift((fileInfo, api) => {
      const j = api.jscodeshift;

      return j(fileInfo.source)
        .find(j.Identifier, { name: "oldName" })
        .replaceWith(() => j.identifier("newName"))
        .toSource();
    });

    await expect(transform(filePath)).resolves.toEqual({ status: "updated", filePath });
    expect(readFileSync(filePath, "utf8")).toBe("const newName = 1;\nconsole.log(newName);\n");
  });

  it("reports unchanged when the transform returns the original source", async () => {
    const filePath = createFile("example.js", "const value = 1;\n");
    const transform = transformer.jscodeshift((fileInfo) => fileInfo.source);

    await expect(transform(filePath)).resolves.toEqual({ status: "unchanged", filePath });
    expect(readFileSync(filePath, "utf8")).toBe("const value = 1;\n");
  });

  it("reports failed when the transform throws", async () => {
    const filePath = createFile("example.js", "const value = 1;\n");
    const transform = transformer.jscodeshift(() => {
      throw new Error("transform failed");
    });

    await expect(transform(filePath)).resolves.toEqual({
      status: "failed",
      filePath,
      reason: "transform failed",
    });
  });
});

describe("transformer.astGrep", () => {
  it("replaces AST matches and reports an updated result", async () => {
    const filePath = createFile(
      "example.js",
      "const first = oldValue();\nconst second = oldValue();\n",
    );
    const transform = transformer.astGrep("oldValue()", { replace: "newValue()" });

    await expect(transform(filePath)).resolves.toEqual({ status: "updated", filePath });
    expect(readFileSync(filePath, "utf8")).toBe(
      "const first = newValue();\nconst second = newValue();\n",
    );
  });

  it("reports needs-review when matches are found without a replacement", async () => {
    const filePath = createFile("example.js", "const value = oldValue();\n");
    const transform = transformer.astGrep({ pattern: "oldValue()" });

    await expect(transform(filePath)).resolves.toEqual({
      status: "needs-review",
      filePath,
      reason: 'Found 1 AST match for pattern "oldValue()".',
    });
  });

  it("reports unchanged when no AST matches are found", async () => {
    const filePath = createFile("example.js", "const value = newValue();\n");
    const transform = transformer.astGrep("oldValue()", { replace: "newValue()" });

    await expect(transform(filePath)).resolves.toEqual({ status: "unchanged", filePath });
    expect(readFileSync(filePath, "utf8")).toBe("const value = newValue();\n");
  });
});

function createFile(fileName: string, source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-transformer-"));
  const filePath = join(directory, fileName);

  tempDirectories.push(directory);
  writeFileSync(filePath, source);

  return filePath;
}
