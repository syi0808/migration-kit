import type { TransformResult, Transformer } from "../types.js";
import { formatError } from "../utils/error.js";

async function runTransform(transform: Transformer, filePath: string): Promise<TransformResult> {
  try {
    return await transform(filePath);
  } catch (error) {
    return { status: "failed", filePath, reason: formatError(error) };
  }
}

export { runTransform };
