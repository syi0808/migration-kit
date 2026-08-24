import type { Writable } from "node:stream";

type ConfirmationOutput = Writable & {
  columns?: number;
  isTTY?: boolean;
};

type ManualConfirmationOptions = {
  output?: ConfirmationOutput;
};

export type { ConfirmationOutput, ManualConfirmationOptions };
