type JscodeshiftParser =
  | "babel"
  | "babylon"
  | "flow"
  | "ts"
  | "tsx"
  | {
      parse(source: string): unknown;
    };

interface JscodeshiftFileInfo {
  path: string;
  source: string;
}

type JscodeshiftCore = ((source: string, options?: unknown) => any) & {
  withParser(parser: JscodeshiftParser): JscodeshiftCore;
  [key: string]: any;
};

interface JscodeshiftApi {
  j: JscodeshiftCore;
  jscodeshift: JscodeshiftCore;
  stats(name: string, quantity?: number): void;
  report(message: string): void;
}

interface JscodeshiftOptions {
  parser?: JscodeshiftParser;
  transformOptions?: Record<string, unknown>;
  stats?: (name: string, quantity: number, filePath: string) => void;
  report?: (message: string, filePath: string) => void;
}

type JscodeshiftTransform = (
  fileInfo: JscodeshiftFileInfo,
  api: JscodeshiftApi,
  options: Record<string, unknown>,
) => Promise<string | null | undefined | void> | string | null | undefined | void;

interface JscodeshiftParseOptions {
  parser?: JscodeshiftParser;
}

type JscodeshiftParseResult = {
  j: JscodeshiftCore;
  root: ReturnType<JscodeshiftCore>;
};

export type {
  JscodeshiftApi,
  JscodeshiftCore,
  JscodeshiftFileInfo,
  JscodeshiftOptions,
  JscodeshiftParseOptions,
  JscodeshiftParseResult,
  JscodeshiftParser,
  JscodeshiftTransform,
};
