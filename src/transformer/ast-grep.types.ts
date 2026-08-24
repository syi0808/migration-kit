interface AstGrepMatch {
  filePath: string;
  index: number;
  source: string;
  text: string;
  context: string;
  start: number;
  end: number;
  node: unknown;
}

type AstGrepReplacement = string | ((match: AstGrepMatch) => string | null | undefined);

interface AstGrepOptions {
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

export type { AstGrepMatch, AstGrepMatcher, AstGrepOptions, AstGrepReplacement, RawAstGrepMatch };
