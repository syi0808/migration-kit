import { readdirSync, statSync, watch, type Dirent, type FSWatcher } from "node:fs";
import { join } from "node:path";

const ignoredDirectories = new Set([".git", "node_modules"]);

async function waitForCwdChange(cwd = process.cwd()): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let watcher: FSWatcher | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

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
