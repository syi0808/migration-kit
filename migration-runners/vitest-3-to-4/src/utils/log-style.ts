import { createColors } from "tinyrainbow";

type LogEnvironment = Record<string, string | undefined>;
type LogOutputStream = {
  isTTY?: boolean;
};

const colors = createColors({
  force: shouldUseColor({
    argv: process.argv,
    env: process.env,
    stream: process.stderr,
  }),
});

function formatCliError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return `  ${colors.red("✗")} ${message}`;
}

function shouldUseColor(options: {
  argv: readonly string[];
  env: LogEnvironment;
  stream: LogOutputStream;
}) {
  const forceColor = options.env.FORCE_COLOR;

  if (
    Object.hasOwn(options.env, "NO_COLOR") ||
    options.argv.includes("--no-color") ||
    options.env.TERM === "dumb" ||
    forceColor === "0" ||
    forceColor === "false" ||
    forceColor === "no"
  ) {
    return false;
  }

  if (Object.hasOwn(options.env, "FORCE_COLOR") || options.argv.includes("--color")) {
    return true;
  }

  return Boolean(options.stream.isTTY);
}

export { formatCliError };
