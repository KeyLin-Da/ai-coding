import type { MemorySearchConfig } from '../../shared/memory';

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}

export function defaultMemorySearchConfig(): MemorySearchConfig {
  return {
    sourceLimits: {
      maxFiles: numberFromEnv('AI_DELIVERY_MEMORY_SOURCE_MAX_FILES', 20),
      maxFileBytes: numberFromEnv('AI_DELIVERY_MEMORY_SOURCE_MAX_FILE_BYTES', 32 * 1024),
      maxTotalBytes: numberFromEnv('AI_DELIVERY_MEMORY_SOURCE_MAX_TOTAL_BYTES', 128 * 1024),
      maxBusinessTerms: numberFromEnv('AI_DELIVERY_MEMORY_MAX_BUSINESS_TERMS', 40),
      maxPhrases: numberFromEnv('AI_DELIVERY_MEMORY_MAX_PHRASES', 20),
      maxTechnicalEntities: numberFromEnv('AI_DELIVERY_MEMORY_MAX_TECH_ENTITIES', 30),
      maxSourceSnippets: numberFromEnv('AI_DELIVERY_MEMORY_MAX_SOURCE_SNIPPETS', 12)
    },
    thresholds: {
      minContentScore: Number(process.env.AI_DELIVERY_MEMORY_MIN_CONTENT_SCORE || 0.8),
      minEmbeddingScore: Number(process.env.AI_DELIVERY_MEMORY_MIN_EMBEDDING_SCORE || 0.72),
      selectedByDefaultScore: Number(process.env.AI_DELIVERY_MEMORY_SELECTED_SCORE || 0.24),
      maxPreviewItems: numberFromEnv('AI_DELIVERY_MEMORY_MAX_PREVIEW_ITEMS', 20),
      maxInjectedItems: numberFromEnv('AI_DELIVERY_MEMORY_MAX_INJECTED_ITEMS', 8),
      maxPendingVerifyItems: numberFromEnv('AI_DELIVERY_MEMORY_MAX_PENDING_VERIFY_ITEMS', 2)
    },
    weights: {
      bm25: Number(process.env.AI_DELIVERY_MEMORY_WEIGHT_BM25 || 1),
      keyword: Number(process.env.AI_DELIVERY_MEMORY_WEIGHT_KEYWORD || 1),
      embedding: Number(process.env.AI_DELIVERY_MEMORY_WEIGHT_EMBEDDING || 1),
      feedback: Number(process.env.AI_DELIVERY_MEMORY_WEIGHT_FEEDBACK || 0.2)
    },
    embedding: {
      enabled: booleanFromEnv('AI_DELIVERY_MEMORY_EMBEDDING_ENABLED', false),
      provider: (process.env.AI_DELIVERY_MEMORY_EMBEDDING_PROVIDER as any) || 'none',
      endpoint: process.env.AI_DELIVERY_MEMORY_EMBEDDING_ENDPOINT,
      model: process.env.AI_DELIVERY_MEMORY_EMBEDDING_MODEL || 'bge-m3',
      dimension: numberFromEnv('AI_DELIVERY_MEMORY_EMBEDDING_DIMENSION', 1024),
      timeoutMs: numberFromEnv('AI_DELIVERY_MEMORY_EMBEDDING_TIMEOUT_MS', 3000),
      batchSize: numberFromEnv('AI_DELIVERY_MEMORY_EMBEDDING_BATCH_SIZE', 32)
    }
  };
}

export function mergeMemorySearchConfig(input: Partial<MemorySearchConfig> = {}): MemorySearchConfig {
  const base = defaultMemorySearchConfig();
  return {
    sourceLimits: { ...base.sourceLimits, ...(input.sourceLimits || {}) },
    thresholds: { ...base.thresholds, ...(input.thresholds || {}) },
    weights: { ...base.weights, ...(input.weights || {}) },
    embedding: { ...base.embedding, ...(input.embedding || {}) }
  };
}
