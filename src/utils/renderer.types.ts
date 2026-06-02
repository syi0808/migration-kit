import type { createLogUpdate } from "log-update";

type LogUpdate = ReturnType<typeof createLogUpdate>;

type RendererProgressOptions = {
  label: string;
  total: number;
  minimumItems?: number;
  renderIntervalMs?: number;
};

type ProgressRenderOptions = {
  force?: boolean;
};

type RendererProgress = {
  clear(): void;
  enabled: boolean;
  render(completed: number, currentItem?: string, renderOptions?: ProgressRenderOptions): void;
};

export type { LogUpdate, ProgressRenderOptions, RendererProgress, RendererProgressOptions };
