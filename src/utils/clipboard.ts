import { spawn } from "node:child_process";

type ClipboardCommand = {
  command: string;
  args: string[];
};

async function copyToClipboard(text: string): Promise<void> {
  const commands = getClipboardCommands();
  const errors: string[] = [];

  for (const command of commands) {
    try {
      await writeClipboardCommand(command, text);
      return;
    } catch (error) {
      errors.push(formatError(error));
    }
  }

  throw new Error(
    errors.length > 0
      ? `Could not copy to clipboard: ${errors.join("; ")}`
      : "Could not copy to clipboard: no supported clipboard command found.",
  );
}

function getClipboardCommands(): ClipboardCommand[] {
  if (process.platform === "darwin") {
    return [{ command: "pbcopy", args: [] }];
  }

  if (process.platform === "win32") {
    return [{ command: "clip", args: [] }];
  }

  return [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ];
}

function writeClipboardCommand({ command, args }: ClipboardCommand, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    const stderr: Buffer[] = [];

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const message = Buffer.concat(stderr).toString("utf8").trim();

      reject(new Error(message || `${command} exited with code ${code ?? "unknown"}.`));
    });
    child.stdin.end(text);
  });
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export { copyToClipboard };
