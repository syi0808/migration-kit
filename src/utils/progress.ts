import type { createLogUpdate } from "log-update";
import { logStyle } from "./log-style.js";
import { pluralize } from "./strings.js";

const defaultMinimumItems = 20;
const defaultRenderIntervalMs = 80;
const progressBarWidth = 20;

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

function createProgressTui(logUpdate: LogUpdate, options: ProgressTuiOptions) {
  const enabled = options.total >= (options.minimumItems ?? defaultMinimumItems);
  const renderIntervalMs = options.renderIntervalMs ?? defaultRenderIntervalMs;
  let lastRenderTime = 0;

  const render = (completed: number, currentItem?: string, renderOptions: RenderOptions = {}) => {
    if (!enabled) {
      return;
    }

    const now = Date.now();

    if (
      !renderOptions.force &&
      completed < options.total &&
      now - lastRenderTime < renderIntervalMs
    ) {
      return;
    }

    lastRenderTime = now;

    const lines = [logStyle.info(formatProgressLine(options.label, completed, options.total), 2)];

    if (currentItem) {
      lines.push(logStyle.detail(currentItem, 3));
    }

    logUpdate(lines.join("\n"));
  };

  const clear = () => {
    if (enabled) {
      logUpdate.clear();
    }
  };

  return { clear, enabled, render };
}

function formatProgressLine(label: string, completed: number, total: number) {
  const safeTotal = Math.max(total, 1);
  const safeCompleted = Math.min(Math.max(completed, 0), total);
  const filled = Math.round((safeCompleted / safeTotal) * progressBarWidth);
  const empty = progressBarWidth - filled;
  const bar = `${"#".repeat(filled)}${"-".repeat(empty)}`;

  return `${label} [${bar}] ${safeCompleted}/${total} ${pluralize(total, "file", "files")}`;
}

export { createProgressTui };
