type LogEnvironment = Record<string, string | undefined>;

type LogOutputStream = {
  isTTY?: boolean;
};

type ColorOptions = {
  argv: readonly string[];
  env: LogEnvironment;
  stream: LogOutputStream;
};

export type { ColorOptions, LogEnvironment, LogOutputStream };
