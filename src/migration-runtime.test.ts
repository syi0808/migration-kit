import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMigrationRuntime,
  getMigrationArtifact,
  readMigrationFile,
  runWithMigrationRuntime,
  writeMigrationFile,
} from "./migration-runtime.js";
import { parseJscodeshiftSourceForScan } from "./transformer/jscodeshift.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("migration runtime", () => {
  it("reuses source-scoped artifacts until the file source changes", async () => {
    const filePath = createFile("example.ts", "const value = 1;\n");
    const runtime = createMigrationRuntime();
    const createArtifact = vi
      .fn()
      .mockReturnValueOnce({ version: "first" })
      .mockReturnValueOnce({ version: "second" });

    await runWithMigrationRuntime(runtime, async () => {
      const source = await readMigrationFile(filePath);
      const first = getMigrationArtifact(filePath, "scan", source, createArtifact);
      const second = getMigrationArtifact(filePath, "scan", source, createArtifact);

      expect(second).toBe(first);
      expect(createArtifact).toHaveBeenCalledTimes(1);

      await writeMigrationFile(filePath, "const value = 2;\n");

      const nextSource = await readMigrationFile(filePath);
      const third = getMigrationArtifact(filePath, "scan", nextSource, createArtifact);

      expect(third).not.toBe(first);
      expect(createArtifact).toHaveBeenCalledTimes(2);
    });
  });

  it("caches jscodeshift parse results for read-only scans inside a runner runtime", async () => {
    const filePath = createFile("example.ts", "const value = oldValue();\n");
    const runtime = createMigrationRuntime();

    await runWithMigrationRuntime(runtime, async () => {
      const source = await readMigrationFile(filePath);
      const first = parseJscodeshiftSourceForScan(filePath, source).root;
      const second = parseJscodeshiftSourceForScan(filePath, source).root;

      expect(second).toBe(first);

      await writeMigrationFile(filePath, "const value = newValue();\n");

      const nextSource = await readMigrationFile(filePath);
      const third = parseJscodeshiftSourceForScan(filePath, nextSource).root;

      expect(third).not.toBe(first);
    });
  });
});

function createFile(fileName: string, source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-runtime-"));
  const filePath = join(directory, fileName);

  tempDirectories.push(directory);
  writeFileSync(filePath, source);

  return filePath;
}
