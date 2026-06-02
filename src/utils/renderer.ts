import { createLogUpdate } from "log-update";
import { logStyle } from "./log-style.js";
import { pluralize } from "./strings.js";
import type {
  LogUpdate,
  ProgressRenderOptions,
  RendererProgress,
  RendererProgressOptions,
} from "./renderer.types.js";

const defaultMinimumItems = 20;
const defaultRenderIntervalMs = 80;
const progressBarWidth = 20;

class MigrationRenderer {
  readonly #logUpdate: LogUpdate;

  constructor(logUpdate: LogUpdate = createLogUpdate(process.stdout)) {
    this.#logUpdate = logUpdate;
  }

  static stdout(): MigrationRenderer {
    return new MigrationRenderer();
  }

  persist(message: string): void {
    this.#logUpdate.persist(message);
  }

  live(message: string): void {
    this.#logUpdate(message);
  }

  clear(): void {
    this.#logUpdate.clear();
  }

  section(message: string): void {
    this.persist(logStyle.section(message));
  }

  info(message: string, indent?: number): void {
    this.persist(logStyle.info(message, indent));
  }

  success(message: string, indent?: number): void {
    this.persist(logStyle.success(message, indent));
  }

  error(message: string, indent?: number): void {
    this.persist(logStyle.error(message, indent));
  }

  warning(message: string, indent?: number): void {
    this.persist(logStyle.warning(message, indent));
  }

  skipped(message: string, indent?: number): void {
    this.persist(logStyle.skipped(message, indent));
  }

  detail(message: string, indent?: number): void {
    this.persist(logStyle.detail(message, indent));
  }

  progress(options: RendererProgressOptions): RendererProgress {
    return new TerminalProgressRenderer(this, options);
  }
}

class TerminalProgressRenderer implements RendererProgress {
  readonly #enabled: boolean;
  readonly #label: string;
  readonly #renderer: MigrationRenderer;
  readonly #renderIntervalMs: number;
  readonly #total: number;
  #lastRenderTime = 0;

  constructor(renderer: MigrationRenderer, options: RendererProgressOptions) {
    this.#enabled = options.total >= (options.minimumItems ?? defaultMinimumItems);
    this.#label = options.label;
    this.#renderer = renderer;
    this.#renderIntervalMs = options.renderIntervalMs ?? defaultRenderIntervalMs;
    this.#total = options.total;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  render(completed: number, currentItem?: string, renderOptions: ProgressRenderOptions = {}): void {
    if (!this.#enabled) {
      return;
    }

    const now = Date.now();

    if (
      !renderOptions.force &&
      completed < this.#total &&
      now - this.#lastRenderTime < this.#renderIntervalMs
    ) {
      return;
    }

    this.#lastRenderTime = now;

    const lines = [logStyle.info(formatProgressLine(this.#label, completed, this.#total), 2)];

    if (currentItem) {
      lines.push(logStyle.detail(currentItem, 3));
    }

    this.#renderer.live(lines.join("\n"));
  }

  clear(): void {
    if (this.#enabled) {
      this.#renderer.clear();
    }
  }
}

function formatProgressLine(label: string, completed: number, total: number): string {
  const safeTotal = Math.max(total, 1);
  const safeCompleted = Math.min(Math.max(completed, 0), total);
  const filled = Math.round((safeCompleted / safeTotal) * progressBarWidth);
  const empty = progressBarWidth - filled;
  const bar = `${"#".repeat(filled)}${"-".repeat(empty)}`;

  return `${label} [${bar}] ${safeCompleted}/${total} ${pluralize(total, "file", "files")}`;
}

export { MigrationRenderer };
export type { LogUpdate, RendererProgress, RendererProgressOptions };
