import { createColors } from "tinyrainbow";

type LogEnvironment = Record<string, string | undefined>;
type LogOutputStream = {
  isTTY?: boolean;
};

type LogStyleOptions = {
  argv?: readonly string[];
  env?: LogEnvironment;
  stream?: LogOutputStream;
};

const escapeCharacter = String.fromCharCode(27);
const ansiPattern = new RegExp(`${escapeCharacter}\\[[0-?]*[ -/]*[@-~]`, "g");

function createLogStyle(options: LogStyleOptions = {}) {
  const colors = createColors({ force: shouldUseColor(options) });

  return {
    section(message: string) {
      return colors.cyan(colors.bold(`◆ ${message}`));
    },
    info(message: string, indent = 1) {
      return statusLine(indent, colors.cyan("→"), message);
    },
    success(message: string, indent = 1) {
      return statusLine(indent, colors.green("✓"), message);
    },
    error(message: string, indent = 1) {
      return statusLine(indent, colors.red("✗"), message);
    },
    warning(message: string, indent = 1) {
      return statusLine(indent, colors.yellow("!"), message);
    },
    skipped(message: string, indent = 1) {
      return statusLine(indent, colors.dim("-"), colors.dim(message));
    },
    detail(message: string, indent = 2) {
      return `${indentation(indent)}${colors.dim(message)}`;
    },
    path(filePath: string) {
      return colors.cyan(filePath);
    },
  };
}

function shouldUseColor(options: LogStyleOptions = {}) {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  const stream = options.stream ?? process.stdout;
  const forceColor = env.FORCE_COLOR;

  if (
    hasOwn(env, "NO_COLOR") ||
    argv.includes("--no-color") ||
    env.TERM === "dumb" ||
    forceColor === "0" ||
    forceColor === "false" ||
    forceColor === "no"
  ) {
    return false;
  }

  if (hasOwn(env, "FORCE_COLOR") || argv.includes("--color")) {
    return true;
  }

  return Boolean(stream.isTTY);
}

function stripAnsi(input: string) {
  return input.replace(ansiPattern, "");
}

function statusLine(indent: number, symbol: string, message: string) {
  return `${indentation(indent)}${symbol} ${message}`;
}

function indentation(level: number) {
  return "  ".repeat(level);
}

function hasOwn(object: LogEnvironment, key: string) {
  return Object.hasOwn(object, key);
}

const logStyle = createLogStyle();

export { createLogStyle, logStyle, shouldUseColor, stripAnsi };
