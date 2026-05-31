import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import { createTextTransform } from "../utils/text-transform.js";

const updateBrowserContextImports: ApiChange = {
  title: "Update @vitest/browser context imports",
  files: sourceFilePatterns,
  transform: createTextTransform((source) =>
    replaceQuotedModuleSpecifier(source, "@vitest/browser/context", "vitest/browser"),
  ),
};

function replaceQuotedModuleSpecifier(source: string, from: string, to: string): string {
  const escapedFrom = escapeRegExp(from);

  return source.replace(new RegExp(`(['"])${escapedFrom}\\1`, "g"), (_match, quote) => {
    return `${quote}${to}${quote}`;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { updateBrowserContextImports };
