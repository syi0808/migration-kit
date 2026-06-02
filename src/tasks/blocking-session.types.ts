import type { BlockPolicy } from "../types.js";
import type { MigrationRenderer } from "../utils/renderer.js";
import type { KeyInputStream } from "../utils/watch.js";

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
  renderer: MigrationRenderer;
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
};
