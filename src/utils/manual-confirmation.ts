import { confirm, isCancel } from "@clack/prompts";

async function requestManualConfirmation(message: string): Promise<boolean> {
  const result = await confirm({
    message,
    active: "Confirmed",
    inactive: "Not yet",
    initialValue: false,
  });

  return !isCancel(result) && result === true;
}

export { requestManualConfirmation };
