import { readdirSync, statSync, watch, type Dirent, type FSWatcher } from "node:fs";
import { join } from "node:path";

const ignoredDirectories = new Set([".git", "node_modules"]);

type KeyInputStream = {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume: () => unknown;
  on: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
  off: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
};

type WaitForCwdChangeOptions = {
  cwd?: string;
  input?: KeyInputStream;
  onKeyPress?: (key: string) => void;
};

async function waitForCwdChange(
  cwdOrOptions: string | WaitForCwdChangeOptions = process.cwd(),
): Promise<void> {
  const options = typeof cwdOrOptions === "string" ? { cwd: cwdOrOptions } : cwdOrOptions;
  const cwd = options.cwd ?? process.cwd();

  return new Promise((resolve) => {
    let settled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let watcher: FSWatcher | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const cleanupKeyPress = listenForKeyPress(options.input ?? process.stdin, options.onKeyPress);

    const done = () => {
      if (settled) {
        return;
      }

      settled = true;
      watcher?.close();

      if (debounce) {
        clearTimeout(debounce);
      }

      if (interval) {
        clearInterval(interval);
      }

      cleanupKeyPress();
      resolve();
    };

    const scheduleDone = () => {
      if (debounce) {
        clearTimeout(debounce);
      }

      debounce = setTimeout(done, 50);
    };

    const startPolling = () => {
      if (settled || interval) {
        return;
      }

      let previousSnapshot = snapshotDirectory(cwd);

      interval = setInterval(() => {
        const nextSnapshot = snapshotDirectory(cwd);

        if (nextSnapshot !== previousSnapshot) {
          done();
          return;
        }

        previousSnapshot = nextSnapshot;
      }, 250);
    };

    try {
      watcher = watch(cwd, { recursive: true }, scheduleDone);
      watcher.on("error", () => {
        watcher?.close();
        watcher = undefined;
        startPolling();
      });
    } catch {
      startPolling();
    }
  });
}

function listenForKeyPress(input: KeyInputStream, onKeyPress?: (key: string) => void) {
  if (!onKeyPress || !input.isTTY || typeof input.setRawMode !== "function") {
    return () => {};
  }

  const wasRaw = Boolean(input.isRaw);
  const onData = (chunk: Buffer | string) => {
    for (const key of chunk.toString("utf8")) {
      if (key === "\u0003") {
        input.setRawMode?.(false);
        process.kill(process.pid, "SIGINT");
        return;
      }

      onKeyPress(key);
    }
  };

  try {
    input.setRawMode(true);
  } catch {
    return () => {};
  }

  input.resume();
  input.on("data", onData);

  return () => {
    input.off("data", onData);

    if (!wasRaw) {
      input.setRawMode?.(false);
    }
  };
}

function snapshotDirectory(directory: string): string {
  const entries: string[] = [];

  walkDirectory(directory, entries);

  return entries.sort().join("\n");
}

function walkDirectory(directory: string, entries: string[]) {
  let directoryEntries: Dirent<string>[];

  try {
    directoryEntries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of directoryEntries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const filePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(filePath, entries);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    try {
      const stats = statSync(filePath);

      entries.push(`${filePath}:${stats.mtimeMs}:${stats.size}`);
    } catch {
      continue;
    }
  }
}

export { waitForCwdChange };
export type { KeyInputStream, WaitForCwdChangeOptions };
