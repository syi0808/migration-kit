import { isCancel, select } from "@clack/prompts";
import type { Writable } from "node:stream";

type ConfirmationOutput = Writable & {
  columns?: number;
  isTTY?: boolean;
};

type ManualConfirmationOptions = {
  output?: ConfirmationOutput;
};

async function requestManualConfirmation(
  message: string,
  options: ManualConfirmationOptions = {},
): Promise<boolean> {
  const output = options.output ?? process.stdout;
  const result = await select({
    message,
    options: [{ value: "confirmed", label: "Confirmed" }],
    initialValue: "confirmed",
    output,
    withGuide: false,
  });

  eraseConfirmationPrompt(output, message, "Confirmed");

  return !isCancel(result) && result === "confirmed";
}

function eraseConfirmationPrompt(
  output: ConfirmationOutput,
  message: string,
  selectedLabel: string,
): void {
  if (!output.isTTY) {
    return;
  }

  const lineCount = countPromptLines(output, message, selectedLabel);

  if (lineCount <= 0) {
    return;
  }

  output.write(`\x1B[${lineCount}A\x1B[0J`);
}

function countPromptLines(
  output: ConfirmationOutput,
  message: string,
  selectedLabel: string,
): number {
  const columns = Math.max(20, output.columns ?? 80);
  const promptPrefixWidth = 3;
  const messageLines = message
    .split("\n")
    .map((line) => Math.max(1, Math.ceil((promptPrefixWidth + line.length) / columns)))
    .reduce((sum, lineCount) => sum + lineCount, 0);

  return messageLines + Math.max(1, Math.ceil(selectedLabel.length / columns));
}

export { requestManualConfirmation };
