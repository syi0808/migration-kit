type LogEnvironment = Record<string, string | undefined>;

type LogOutputStream = {
  isTTY?: boolean;
};

type LogStyleOptions = {
  argv?: readonly string[];
  env?: LogEnvironment;
  stream?: LogOutputStream;
};

type LogStyle = {
  section(message: string): string;
  info(message: string, indent?: number): string;
  success(message: string, indent?: number): string;
  error(message: string, indent?: number): string;
  warning(message: string, indent?: number): string;
  skipped(message: string, indent?: number): string;
  detail(message: string, indent?: number): string;
  path(filePath: string): string;
};

export type { LogEnvironment, LogOutputStream, LogStyle, LogStyleOptions };
