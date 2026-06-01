import { createRequire } from "node:module";
import { extname } from "node:path";
import type { Transformer } from "../types.js";
import {
  getMigrationArtifact,
  readMigrationFile,
  writeMigrationFile,
} from "../migration-runtime.js";

const require = createRequire(import.meta.url);

export type JscodeshiftParser =
  | "babel"
  | "babylon"
  | "flow"
  | "ts"
  | "tsx"
  | {
      parse(source: string): unknown;
    };

export interface JscodeshiftFileInfo {
  path: string;
  source: string;
}

export type JscodeshiftCore = ((source: string, options?: unknown) => any) & {
  withParser(parser: JscodeshiftParser): JscodeshiftCore;
  [key: string]: any;
};

export interface JscodeshiftApi {
  j: JscodeshiftCore;
  jscodeshift: JscodeshiftCore;
  stats(name: string, quantity?: number): void;
  report(message: string): void;
}

export interface JscodeshiftOptions {
  parser?: JscodeshiftParser;
  transformOptions?: Record<string, unknown>;
  stats?: (name: string, quantity: number, filePath: string) => void;
  report?: (message: string, filePath: string) => void;
}

export type JscodeshiftTransform = (
  fileInfo: JscodeshiftFileInfo,
  api: JscodeshiftApi,
  options: Record<string, unknown>,
) => Promise<string | null | undefined | void> | string | null | undefined | void;

export interface JscodeshiftParseOptions {
  parser?: JscodeshiftParser;
}

export type JscodeshiftParseResult = {
  j: JscodeshiftCore;
  root: ReturnType<JscodeshiftCore>;
};

function jscodeshift(
  transform: JscodeshiftTransform,
  options: JscodeshiftOptions = {},
): Transformer {
  return async (filePath) => {
    try {
      const source = await readMigrationFile(filePath);
      const api = createJscodeshiftApi(filePath, options);
      const output = await transform(
        { path: filePath, source },
        api,
        options.transformOptions ?? {},
      );

      if (typeof output !== "string" || output === source) {
        return { status: "unchanged", filePath };
      }

      await writeMigrationFile(filePath, output);

      return { status: "updated", filePath };
    } catch (error) {
      return { status: "failed", filePath, reason: getErrorMessage(error) };
    }
  };
}

function parseJscodeshiftSourceForScan(
  filePath: string,
  source: string,
  options: JscodeshiftParseOptions = {},
): JscodeshiftParseResult {
  const parser = options.parser ?? inferParser(filePath);
  const j = loadJscodeshift().withParser(parser);
  const cacheKey = `jscodeshift:${getParserCacheKey(parser)}`;
  const root = getMigrationArtifact(filePath, cacheKey, source, () => j(source));

  return { j, root };
}

function createJscodeshiftApi(filePath: string, options: JscodeshiftOptions): JscodeshiftApi {
  const jscodeshift = loadJscodeshift().withParser(options.parser ?? inferParser(filePath));

  return {
    j: jscodeshift,
    jscodeshift,
    stats: (name, quantity = 1) => {
      options.stats?.(name, quantity, filePath);
    },
    report: (message) => {
      options.report?.(message, filePath);
    },
  };
}

function inferParser(filePath: string): JscodeshiftParser {
  const extension = extname(filePath);

  if (extension === ".ts" || extension === ".mts" || extension === ".cts") {
    return "ts";
  }

  if (extension === ".tsx") {
    return "tsx";
  }

  return "babel";
}

function loadJscodeshift(): JscodeshiftCore {
  const module = require("jscodeshift") as JscodeshiftCore | { default: JscodeshiftCore };

  return "default" in module ? module.default : module;
}

const parserObjectIds = new WeakMap<object, number>();
let nextParserObjectId = 1;

function getParserCacheKey(parser: JscodeshiftParser): string {
  if (typeof parser === "string") {
    return parser;
  }

  const cached = parserObjectIds.get(parser);

  if (cached) {
    return `custom:${cached}`;
  }

  const id = nextParserObjectId;
  nextParserObjectId += 1;
  parserObjectIds.set(parser, id);

  return `custom:${id}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { jscodeshift, parseJscodeshiftSourceForScan };
