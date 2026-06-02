import type { createLogUpdate } from "log-update";
import type { BlockPolicy } from "../types.js";
import type { KeyInputStream } from "../utils/watch.js";

type LogUpdate = ReturnType<typeof createLogUpdate>;

type BlockingItem = {
  key: string;
  detail: string;
};

type BlockingConfirmation = BlockingItem & {
  prompt: string;
};

type BlockingSnapshot = {
  manualFixes: BlockingItem[];
  confirmations: BlockingConfirmation[];
  failures: BlockingItem[];
};

type BlockingSessionOptions = {
  logUpdate: LogUpdate;
  policy: BlockPolicy;
  collectSnapshot: () => BlockingSnapshot | Promise<BlockingSnapshot>;
  copy?: (text: string) => Promise<void>;
  input?: KeyInputStream;
};

type CopyStatus = { status: "success"; count: number } | { status: "failure"; reason: string };

export type {
  BlockingConfirmation,
  BlockingItem,
  BlockingSessionOptions,
  BlockingSnapshot,
  CopyStatus,
  LogUpdate,
};
