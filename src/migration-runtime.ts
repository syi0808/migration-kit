import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, statSync, writeFileSync, type Stats } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";

type SourceCacheEntry = {
  source: string;
  mtimeMs: number;
  size: number;
};

type ArtifactCacheEntry = {
  source: string;
  value: unknown;
};

type MigrationRuntimeOptions = {
  maxSourceEntries?: number;
  maxArtifactEntries?: number;
};

class MigrationRuntime {
  readonly #maxSourceEntries: number;
  readonly #maxArtifactEntries: number;
  readonly #sources = new Map<string, SourceCacheEntry>();
  readonly #artifacts = new Map<string, Map<string, ArtifactCacheEntry>>();

  constructor(options: MigrationRuntimeOptions = {}) {
    this.#maxSourceEntries = options.maxSourceEntries ?? 1000;
    this.#maxArtifactEntries = options.maxArtifactEntries ?? 100;
  }

  async readSource(filePath: string): Promise<string> {
    const fileStat = await stat(filePath);
    const cached = this.#getFreshSource(filePath, fileStat);

    if (cached) {
      return cached.source;
    }

    const source = await readFile(filePath, "utf8");
    this.#setSource(filePath, source, fileStat);

    return source;
  }

  readSourceSync(filePath: string): string {
    const fileStat = statSync(filePath);
    const cached = this.#getFreshSource(filePath, fileStat);

    if (cached) {
      return cached.source;
    }

    const source = readFileSync(filePath, "utf8");
    this.#setSource(filePath, source, fileStat);

    return source;
  }

  async writeSource(filePath: string, source: string): Promise<void> {
    await writeFile(filePath, source);
    const fileStat = await stat(filePath);

    this.#setSource(filePath, source, fileStat);
  }

  writeSourceSync(filePath: string, source: string) {
    writeFileSync(filePath, source);
    const fileStat = statSync(filePath);

    this.#setSource(filePath, source, fileStat);
  }

  getArtifact<T>(filePath: string, key: string, source: string, create: () => T): T {
    let artifacts = this.#artifacts.get(filePath);

    if (!artifacts) {
      artifacts = new Map();
      this.#artifacts.set(filePath, artifacts);
      this.#trimArtifactCache();
    } else {
      this.#artifacts.delete(filePath);
      this.#artifacts.set(filePath, artifacts);
    }

    const cached = artifacts.get(key);

    if (cached?.source === source) {
      artifacts.delete(key);
      artifacts.set(key, cached);

      return cached.value as T;
    }

    const value = create();
    artifacts.set(key, { source, value });

    return value;
  }

  invalidate(filePath: string) {
    this.#sources.delete(filePath);
    this.#artifacts.delete(filePath);
  }

  #getFreshSource(filePath: string, fileStat: Stats): SourceCacheEntry | null {
    const cached = this.#sources.get(filePath);

    if (!cached) {
      return null;
    }

    if (cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
      this.#sources.delete(filePath);
      this.#sources.set(filePath, cached);

      return cached;
    }

    this.invalidate(filePath);

    return null;
  }

  #setSource(filePath: string, source: string, fileStat: Stats) {
    this.#sources.delete(filePath);
    this.#sources.set(filePath, {
      source,
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
    });
    this.#artifacts.delete(filePath);
    this.#trimSourceCache();
  }

  #trimSourceCache() {
    while (this.#sources.size > this.#maxSourceEntries) {
      const oldest = this.#sources.keys().next().value;

      if (oldest === undefined) {
        return;
      }

      this.#sources.delete(oldest);
      this.#artifacts.delete(oldest);
    }
  }

  #trimArtifactCache() {
    while (this.#artifacts.size > this.#maxArtifactEntries) {
      const oldest = this.#artifacts.keys().next().value;

      if (oldest === undefined) {
        return;
      }

      this.#artifacts.delete(oldest);
    }
  }
}

const runtimeStorage = new AsyncLocalStorage<MigrationRuntime>();

function createMigrationRuntime(options?: MigrationRuntimeOptions) {
  return new MigrationRuntime(options);
}

function runWithMigrationRuntime<T>(runtime: MigrationRuntime, fn: () => T): T {
  return runtimeStorage.run(runtime, fn);
}

function getMigrationRuntime() {
  return runtimeStorage.getStore();
}

async function readMigrationFile(filePath: string): Promise<string> {
  return getMigrationRuntime()?.readSource(filePath) ?? readFile(filePath, "utf8");
}

function readMigrationFileSync(filePath: string): string {
  return getMigrationRuntime()?.readSourceSync(filePath) ?? readFileSync(filePath, "utf8");
}

async function writeMigrationFile(filePath: string, source: string): Promise<void> {
  const runtime = getMigrationRuntime();

  if (runtime) {
    await runtime.writeSource(filePath, source);
    return;
  }

  await writeFile(filePath, source);
}

function writeMigrationFileSync(filePath: string, source: string) {
  const runtime = getMigrationRuntime();

  if (runtime) {
    runtime.writeSourceSync(filePath, source);
    return;
  }

  writeFileSync(filePath, source);
}

function getMigrationArtifact<T>(
  filePath: string,
  key: string,
  source: string,
  create: () => T,
): T {
  return getMigrationRuntime()?.getArtifact(filePath, key, source, create) ?? create();
}

export {
  createMigrationRuntime,
  getMigrationArtifact,
  getMigrationRuntime,
  readMigrationFile,
  readMigrationFileSync,
  runWithMigrationRuntime,
  writeMigrationFile,
  writeMigrationFileSync,
};
