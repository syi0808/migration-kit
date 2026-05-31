import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import { createTextTransform } from "../utils/text-transform.js";

const preserveCoverageIgnoreComments: ApiChange = {
  title: "Preserve coverage ignore comments",
  description:
    "Adds @preserve to istanbul/v8 ignore block comments so esbuild keeps them for coverage.",
  files: sourceFilePatterns,
  transform: createTextTransform((source) =>
    source.replace(/\/\*\s*((?:istanbul|v8) ignore\b[^*]*?)\s*\*\//g, (match, directive) => {
      const text = String(directive).trim();

      if (text.includes("@preserve")) {
        return match;
      }

      return `/* ${text} -- @preserve */`;
    }),
  ),
};

export { preserveCoverageIgnoreComments };
