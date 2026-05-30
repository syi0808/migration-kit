import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Transformer } from "../types.js";

const require = createRequire(import.meta.url);

export interface AstGrepMatch {
  filePath: string;
  index: number;
  source: string;
  text: string;
  context: string;
  start: number;
  end: number;
  node: unknown;
}

export type AstGrepReplacement = string | ((match: AstGrepMatch) => string | null | undefined);

export interface AstGrepOptions {
  pattern: string;
  anonymous?: boolean;
  replace?: AstGrepReplacement;
  reason?: string | ((matches: AstGrepMatch[]) => string);
}

type AstGrepMatcher = (
  source: string,
  options: { pattern: string; anonymous?: boolean },
) => RawAstGrepMatch[];

type RawAstGrepMatch = {
  text: string;
  node: {
    start?: unknown;
    end?: unknown;
  };
};

function astGrep(pattern: string, options?: Omit<AstGrepOptions, "pattern">): Transformer;
function astGrep(options: AstGrepOptions): Transformer;
function astGrep(
  patternOrOptions: string | AstGrepOptions,
  options: Omit<AstGrepOptions, "pattern"> = {},
): Transformer {
  const astGrepOptions =
    typeof patternOrOptions === "string"
      ? { ...options, pattern: patternOrOptions }
      : patternOrOptions;

  return async (filePath) => {
    try {
      const source = await readFile(filePath, "utf8");
      const matches = findMatches(filePath, source, astGrepOptions);

      if (matches.length === 0) {
        return { status: "unchanged", filePath };
      }

      if (astGrepOptions.replace === undefined) {
        return {
          status: "needs-review",
          filePath,
          reason: getNeedsReviewReason(astGrepOptions, matches),
        };
      }

      const output = applyReplacements(source, matches, astGrepOptions.replace);

      if (output === source) {
        return { status: "unchanged", filePath };
      }

      await writeFile(filePath, output);

      return { status: "updated", filePath };
    } catch (error) {
      return { status: "failed", filePath, reason: getErrorMessage(error) };
    }
  };
}

function findMatches(filePath: string, source: string, options: AstGrepOptions): AstGrepMatch[] {
  const matcher = loadAstGrep();
  const matcherOptions: { pattern: string; anonymous?: boolean } = { pattern: options.pattern };

  if (options.anonymous !== undefined) {
    matcherOptions.anonymous = options.anonymous;
  }

  return matcher(source, matcherOptions).map((match, index) => {
    const start = match.node.start;
    const end = match.node.end;

    if (typeof start !== "number" || typeof end !== "number") {
      throw new Error("ast-grep returned a match without source range information.");
    }

    return {
      filePath,
      index,
      source,
      text: source.slice(start, end),
      context: match.text,
      start,
      end,
      node: match.node,
    };
  });
}

function applyReplacements(
  source: string,
  matches: AstGrepMatch[],
  replacement: AstGrepReplacement,
): string {
  return [...matches]
    .sort((left, right) => right.start - left.start)
    .reduce((output, match) => {
      const nextText = typeof replacement === "function" ? replacement(match) : replacement;

      if (nextText == null) {
        return output;
      }

      return output.slice(0, match.start) + nextText + output.slice(match.end);
    }, source);
}

function getNeedsReviewReason(options: AstGrepOptions, matches: AstGrepMatch[]): string {
  if (typeof options.reason === "function") {
    return options.reason(matches);
  }

  if (options.reason) {
    return options.reason;
  }

  return `Found ${matches.length} AST match${matches.length === 1 ? "" : "es"} for pattern "${options.pattern}".`;
}

function loadAstGrep(): AstGrepMatcher {
  const module = require("ast-grep") as AstGrepMatcher | { default: AstGrepMatcher };

  return "default" in module ? module.default : module;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { astGrep };
