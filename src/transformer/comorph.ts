import { createOxcParser, runTransform } from "comorph";
import type { CodemodModule, Diagnostic } from "comorph";
import { readMigrationFile, writeMigrationFile } from "../migration-runtime.js";
import type { Transformer, TransformResult } from "../types.js";
import type { ComorphOptions } from "./comorph.types.js";

function comorph(transform: CodemodModule, options: ComorphOptions = {}): Transformer {
  return async (filePath): Promise<TransformResult> => {
    try {
      const source = await readMigrationFile(filePath);
      const result = await runTransform({
        transform,
        files: [{ path: filePath, source }],
        parser: options.parser ?? createOxcParser(),
      });
      const diagnostics = result.diagnostics.filter(
        (diagnostic) => diagnostic.file === undefined || diagnostic.file === filePath,
      );
      const failure = getDiagnostics(diagnostics, "failed");

      if (failure.length > 0) {
        return { status: "failed", filePath, reason: formatDiagnostics(failure) };
      }

      const review = getDiagnostics(diagnostics, "review");

      if (review.length > 0) {
        return { status: "needs-review", filePath, reason: formatDiagnostics(review) };
      }

      const file = result.files.find((item) => item.path === filePath);

      if (!file || !file.changed || file.output === source) {
        return { status: "unchanged", filePath };
      }

      await writeMigrationFile(filePath, file.output);

      return { status: "updated", filePath };
    } catch (error) {
      return { status: "failed", filePath, reason: getErrorMessage(error) };
    }
  };
}

function getDiagnostics(
  diagnostics: readonly Diagnostic[],
  severity: Diagnostic["severity"],
): Diagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity);
}

function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { comorph };
export type { ComorphOptions };
export type { CodemodModule, ParserAdapter } from "comorph";
