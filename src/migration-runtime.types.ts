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

export type { ArtifactCacheEntry, MigrationRuntimeOptions, SourceCacheEntry };
