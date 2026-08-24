import { readFile, writeFile } from "node:fs/promises";
import type { Transformer, TransformResult } from "migration-kit";

function createTextTransform(rewrite: (source: string) => string): Transformer {
  return async (filePath): Promise<TransformResult> => {
    try {
      const source = await readFile(filePath, "utf8");
      const output = rewrite(source);

      if (output === source) {
        return { status: "unchanged", filePath };
      }

      await writeFile(filePath, output);

      return { status: "updated", filePath };
    } catch (error) {
      return { status: "failed", filePath, reason: formatError(error) };
    }
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { createTextTransform, formatError };
