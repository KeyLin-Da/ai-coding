import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  MemoryCard,
  MemoryEmbeddingIndex,
  MemoryEmbeddingItem,
  MemoryQueryProfile,
  MemorySearchConfig
} from '../../shared/memory';
import { assertMemoryPath, memoryEmbeddingIndexPath } from './memory-paths';
import { memoryCardContentHash } from './memory-repository';
import { defaultMemorySearchConfig } from './memory-search-config';

export interface EmbeddingProvider {
  name: string;
  model: string;
  dimension: number;
  embedTexts(texts: string[]): Promise<number[][]>;
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (!length) {
    return 0;
  }
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function emptyIndex(config: MemorySearchConfig): MemoryEmbeddingIndex {
  return {
    version: 1,
    model: config.embedding.model,
    dimension: config.embedding.dimension,
    updatedAt: '',
    items: []
  };
}

async function readEmbeddingIndex(workspaceRoot: string, config: MemorySearchConfig): Promise<MemoryEmbeddingIndex> {
  const absolute = assertMemoryPath(workspaceRoot, memoryEmbeddingIndexPath());
  const raw = await fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  if (!raw) {
    return emptyIndex(config);
  }
  const parsed = JSON.parse(raw) as MemoryEmbeddingIndex;
  if (parsed.model !== config.embedding.model || parsed.dimension !== config.embedding.dimension || parsed.version !== 1) {
    return emptyIndex(config);
  }
  return parsed;
}

async function writeEmbeddingIndex(workspaceRoot: string, index: MemoryEmbeddingIndex): Promise<void> {
  const absolute = assertMemoryPath(workspaceRoot, memoryEmbeddingIndexPath());
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await fs.rename(temp, absolute);
}

export function buildMemoryEmbeddingText(card: MemoryCard): string {
  return [
    `类型: ${card.type}`,
    `结论: ${card.statement}`,
    `标签: ${card.tags.join(', ')}`,
    ...card.evidence.slice(0, 3).map((item) => `证据: ${item.quote}`)
  ].filter(Boolean).join('\n');
}

export function buildQueryEmbeddingText(profile: MemoryQueryProfile): string {
  return [
    `需求意图: ${profile.intentSummary}`,
    `业务词: ${profile.businessTerms.join(', ')}`,
    `技术实体: ${profile.technicalEntities.join(', ')}`,
    `约束: ${profile.constraints.join('; ')}`,
    `摘要: ${profile.sourceSnippets.slice(0, 5).join('; ')}`
  ].filter((line) => !/:\s*$/.test(line)).join('\n');
}

function parseEmbeddingResponse(value: any): number[][] {
  if (Array.isArray(value?.data)) {
    return value.data.map((item: any) => item.embedding).filter(Array.isArray);
  }
  if (Array.isArray(value?.embeddings)) {
    return value.embeddings.filter(Array.isArray);
  }
  if (Array.isArray(value) && Array.isArray(value[0])) {
    return value;
  }
  return [];
}

export function createEmbeddingProvider(config: MemorySearchConfig = defaultMemorySearchConfig()): EmbeddingProvider {
  if (!config.embedding.enabled || config.embedding.provider === 'none') {
    return {
      name: 'none',
      model: config.embedding.model,
      dimension: config.embedding.dimension,
      async embedTexts() {
        return [];
      }
    };
  }
  return {
    name: config.embedding.provider,
    model: config.embedding.model,
    dimension: config.embedding.dimension,
    async embedTexts(texts: string[]) {
      if (!config.embedding.endpoint) {
        throw new Error('Embedding endpoint 未配置');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.embedding.timeoutMs);
      try {
        const response = await fetch(config.embedding.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.embedding.model, input: texts }),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`Embedding 服务返回 ${response.status}`);
        }
        const embeddings = parseEmbeddingResponse(await response.json());
        if (embeddings.length !== texts.length) {
          throw new Error('Embedding 返回数量与输入数量不一致');
        }
        return embeddings.map(normalizeVector);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

async function ensureEmbeddingIndex(
  workspaceRoot: string,
  cards: MemoryCard[],
  provider: EmbeddingProvider,
  config: MemorySearchConfig
): Promise<MemoryEmbeddingIndex> {
  const existing = await readEmbeddingIndex(workspaceRoot, config);
  const byKey = new Map(existing.items.map((item) => [`${item.memoryId}:${item.contentHash}`, item]));
  const nextItems: MemoryEmbeddingItem[] = [];
  const missing: MemoryCard[] = [];
  for (const card of cards) {
    const contentHash = card.contentHash || memoryCardContentHash(card);
    const existingItem = byKey.get(`${card.id}:${contentHash}`);
    if (existingItem) {
      nextItems.push(existingItem);
    } else {
      missing.push({ ...card, contentHash });
    }
  }
  for (let index = 0; index < missing.length; index += config.embedding.batchSize) {
    const batch = missing.slice(index, index + config.embedding.batchSize);
    const vectors = await provider.embedTexts(batch.map(buildMemoryEmbeddingText));
    vectors.forEach((vector, vectorIndex) => {
      const card = batch[vectorIndex];
      nextItems.push({
        memoryId: card.id,
        projectId: card.projectId,
        contentHash: card.contentHash || memoryCardContentHash(card),
        model: provider.model,
        vector,
        updatedAt: new Date().toISOString()
      });
    });
  }
  const next: MemoryEmbeddingIndex = {
    version: 1,
    model: provider.model,
    dimension: provider.dimension,
    updatedAt: new Date().toISOString(),
    items: nextItems
  };
  if (missing.length || existing.items.length !== nextItems.length) {
    await writeEmbeddingIndex(workspaceRoot, next);
  }
  return next;
}

export async function searchMemoryByEmbedding(
  workspaceRoot: string,
  cards: MemoryCard[],
  profile: MemoryQueryProfile,
  config: MemorySearchConfig = defaultMemorySearchConfig()
): Promise<Map<string, number>> {
  if (!config.embedding.enabled || config.embedding.provider === 'none' || !cards.length) {
    return new Map();
  }
  try {
    const provider = createEmbeddingProvider(config);
    const [queryVector] = await provider.embedTexts([buildQueryEmbeddingText(profile)]);
    if (!queryVector?.length) {
      return new Map();
    }
    const index = await ensureEmbeddingIndex(workspaceRoot, cards, provider, config);
    const scores = new Map<string, number>();
    for (const item of index.items) {
      scores.set(item.memoryId, cosine(queryVector, item.vector));
    }
    return scores;
  } catch (error) {
    return new Map();
  }
}

export async function rebuildMemoryEmbeddingIndex(
  workspaceRoot: string,
  cards: MemoryCard[],
  config: MemorySearchConfig = defaultMemorySearchConfig()
): Promise<MemoryEmbeddingIndex> {
  const provider = createEmbeddingProvider(config);
  if (provider.name === 'none') {
    const index = emptyIndex(config);
    await writeEmbeddingIndex(workspaceRoot, index);
    return index;
  }
  return ensureEmbeddingIndex(workspaceRoot, cards, provider, config);
}

export const internalForTests = {
  cosine,
  normalizeVector,
  buildMemoryEmbeddingText,
  buildQueryEmbeddingText,
  parseEmbeddingResponse
};
