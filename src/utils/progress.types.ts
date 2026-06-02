import type { createLogUpdate } from "log-update";

type LogUpdate = ReturnType<typeof createLogUpdate>;

type ProgressTuiOptions = {
  label: string;
  total: number;
  minimumItems?: number;
  renderIntervalMs?: number;
};

type RenderOptions = {
  force?: boolean;
};

type ProgressTui = {
  clear(): void;
  enabled: boolean;
  render(completed: number, currentItem?: string, renderOptions?: RenderOptions): void;
};

export type { LogUpdate, ProgressTui, ProgressTuiOptions, RenderOptions };
