import type { MemoryCard, MemoryQueryProfile, MemoryRecallScoreBreakdown } from '../../shared/memory';
import type { RequirementWorkflow, WorkflowStage } from '../../shared/workflow';
import { MemoryRepository } from './memory-repository';
import { defaultMemorySearchConfig } from './memory-search-config';
import { buildMemoryQueryProfile, profileWords } from './memory-query-profile-service';
import { searchMemoryByEmbedding } from './memory-embedding-service';

export interface MemorySearchContext {
  projectId?: string;
  requirementId: string;
  title?: string;
  stage?: WorkflowStage;
  modules?: string[];
  keywords?: string[];
  queryProfile?: MemoryQueryProfile;
  sourceFilePaths?: string[];
  clarification?: string;
  runIntent?: string;
  limit?: number;
}

export interface MemorySearchResult {
  card: MemoryCard;
  score: number;
  reasons: string[];
  selectedByDefault?: boolean;
  sourceSummary?: string;
  scoreBreakdown?: MemoryRecallScoreBreakdown;
}

export function words(value = ''): string[] {
  return profileWords(value);
}

function weightedText(card: MemoryCard): string {
  return [
    card.statement,
    card.statement,
    card.statement,
    card.statement,
    card.tags.join(' '),
    card.tags.join(' '),
    card.tags.join(' '),
    card.evidence.map((item) => item.quote).join(' '),
    card.type
  ].join(' ');
}

function sourceSummary(card: MemoryCard): string {
  const evidence = card.evidence[0];
  return [evidence?.requirementId, evidence?.path || evidence?.artifactPath].filter(Boolean).join(' ') || '项目记忆';
}

function hasStageScope(card: MemoryCard, stage?: WorkflowStage): boolean {
  return !card.appliesTo.stages.length || !stage || card.appliesTo.stages.includes(stage);
}

function hasModuleScope(card: MemoryCard, modules: string[] = []): boolean {
  if (!card.appliesTo.modules.length) {
    return true;
  }
  const moduleSet = new Set(modules.map((item) => item.toLowerCase()));
  return card.appliesTo.modules.some((item) => moduleSet.has(item.toLowerCase()));
}

function inScope(card: MemoryCard, context: MemorySearchContext): boolean {
  return card.status === 'ACTIVE'
    && hasStageScope(card, context.stage)
    && hasModuleScope(card, context.modules || []);
}

function queryTerms(context: MemorySearchContext): string[] {
  const profile = context.queryProfile;
  return words([
    context.title,
    ...(context.keywords || []),
    profile?.intentSummary,
    ...(profile?.modules || []),
    ...(profile?.businessTerms || []),
    ...(profile?.technicalEntities || []),
    ...(profile?.constraints || []),
    ...(profile?.sourceSnippets || [])
  ].filter(Boolean).join(' '));
}

function bm25Scores(cards: MemoryCard[], terms: string[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (!cards.length || !terms.length) {
    return scores;
  }
  const docs = cards.map((card) => ({ card, tokens: words(weightedText(card)) }));
  const avgLength = docs.reduce((sum, item) => sum + item.tokens.length, 0) / docs.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const term of terms) {
    const count = docs.filter((doc) => doc.tokens.includes(term)).length;
    if (count) {
      documentFrequency.set(term, count);
    }
  }
  const k1 = 1.2;
  const b = 0.75;
  for (const doc of docs) {
    let score = 0;
    const tf = new Map<string, number>();
    for (const token of doc.tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    for (const term of terms) {
      const freq = tf.get(term) || 0;
      const df = documentFrequency.get(term) || 0;
      if (!freq || !df) {
        continue;
      }
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      const denominator = freq + k1 * (1 - b + b * (doc.tokens.length / avgLength));
      score += idf * ((freq * (k1 + 1)) / denominator);
    }
    if (score > 0) {
      scores.set(doc.card.id, score);
    }
  }
  return scores;
}

function keywordScores(cards: MemoryCard[], context: MemorySearchContext): Map<string, number> {
  const profile = context.queryProfile;
  const highValueTerms = [
    ...(profile?.technicalEntities || []),
    ...(profile?.businessTerms || []),
    ...(profile?.constraints || []),
    ...(context.keywords || [])
  ].map((item) => item.toLowerCase()).filter(Boolean);
  const scores = new Map<string, number>();
  for (const card of cards) {
    const text = `${card.statement} ${card.tags.join(' ')} ${card.evidence.map((item) => item.quote).join(' ')}`.toLowerCase();
    let score = 0;
    for (const term of highValueTerms) {
      if (text.includes(term)) {
        score += term.length >= 6 ? 2 : 1;
      }
    }
    if (score > 0) {
      scores.set(card.id, score);
    }
  }
  return scores;
}

function rankScores(scores: Map<string, number>, weight: number): Map<string, number> {
  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const result = new Map<string, number>();
  ranked.forEach(([memoryId], index) => {
    result.set(memoryId, weight / (60 + index + 1));
  });
  return result;
}

function mergeRankScores(...scores: Map<string, number>[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const scoreMap of scores) {
    for (const [memoryId, score] of scoreMap.entries()) {
      result.set(memoryId, (result.get(memoryId) || 0) + score);
    }
  }
  return result;
}

function normalizeScore(score: number, max: number): number {
  return max > 0 ? score / max : 0;
}

function maxScore(scores: Map<string, number>): number {
  return Math.max(0, ...scores.values());
}

function reasonList(card: MemoryCard, breakdown: MemoryRecallScoreBreakdown, context: MemorySearchContext): string[] {
  const reasons = ['适用范围匹配'];
  if (context.stage && card.appliesTo.stages.includes(context.stage)) {
    reasons.push(`阶段适用 ${context.stage}`);
  }
  const modules = new Set((context.modules || []).map((item) => item.toLowerCase()));
  const moduleMatches = card.appliesTo.modules.filter((item) => modules.has(item.toLowerCase()));
  if (moduleMatches.length) {
    reasons.push(`工程适用 ${moduleMatches.join(', ')}`);
  }
  if ((breakdown.bm25 || 0) > 0) {
    reasons.push('BM25 内容匹配');
  }
  if ((breakdown.keyword || 0) > 0) {
    reasons.push('业务/技术实体匹配');
  }
  if ((breakdown.embedding || 0) > 0) {
    reasons.push('语义向量匹配');
  }
  if (card.status === 'PENDING_VERIFY') {
    reasons.push('待验证检查项');
  }
  return reasons;
}

function dedupeSimilar(results: MemorySearchResult[]): MemorySearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = words(result.card.statement).slice(0, 12).sort().join('|');
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function scoreCard(card: MemoryCard, context: MemorySearchContext): MemorySearchResult | undefined {
  if (!inScope(card, context)) {
    return undefined;
  }
  const terms = queryTerms(context);
  const bm25 = bm25Scores([card], terms).get(card.id) || 0;
  const keyword = keywordScores([card], context).get(card.id) || 0;
  if (!bm25 && !keyword) {
    return undefined;
  }
  const score = bm25 + keyword + Math.max(0, Math.min(0.05, card.confidence || 0));
  const scoreBreakdown = {
    scopeMatched: true,
    bm25,
    keyword,
    final: score
  };
  return {
    card,
    score,
    reasons: reasonList(card, scoreBreakdown, context),
    selectedByDefault: score >= defaultMemorySearchConfig().thresholds.selectedByDefaultScore,
    sourceSummary: sourceSummary(card),
    scoreBreakdown
  };
}

export async function searchProjectMemory(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: Partial<MemorySearchContext> = {}
): Promise<MemorySearchResult[]> {
  const config = defaultMemorySearchConfig();
  const repository = new MemoryRepository(workspaceRoot);
  const context: MemorySearchContext = {
    projectId: input.projectId,
    requirementId: workflow.requirementId,
    title: input.title || workflow.title,
    stage: input.stage || workflow.currentStage,
    modules: input.modules || (workflow.projects || []).map((project) => project.name || project.path).filter(Boolean),
    keywords: input.keywords || [],
    queryProfile: input.queryProfile,
    sourceFilePaths: input.sourceFilePaths,
    clarification: input.clarification,
    runIntent: input.runIntent,
    limit: input.limit
  };
  if (!context.queryProfile) {
    context.queryProfile = await buildMemoryQueryProfile(workspaceRoot, workflow, {
      actionType: 'DESIGN_GENERATE',
      stage: context.stage,
      title: context.title,
      sourceFilePaths: context.sourceFilePaths,
      clarification: context.clarification,
      runIntent: context.runIntent
    }, config);
  }
  const cards = (await repository.listAllCards({ projectId: context.projectId }))
    .filter((card) => inScope(card, context));
  if (!cards.length) {
    return [];
  }
  const terms = queryTerms(context);
  const bm25 = bm25Scores(cards, terms);
  const keyword = keywordScores(cards, context);
  const embedding = await searchMemoryByEmbedding(workspaceRoot, cards, context.queryProfile, config);
  const merged = mergeRankScores(
    rankScores(bm25, config.weights.bm25),
    rankScores(keyword, config.weights.keyword),
    rankScores(embedding, config.weights.embedding)
  );
  const bm25Max = maxScore(bm25);
  const keywordMax = maxScore(keyword);
  const results = cards
    .map((card) => {
      const bm25Score = bm25.get(card.id) || 0;
      const keywordScore = keyword.get(card.id) || 0;
      const embeddingScore = embedding.get(card.id) || 0;
      const hasContentMatch = bm25Score >= config.thresholds.minContentScore
        || keywordScore > 0
        || embeddingScore >= config.thresholds.minEmbeddingScore;
      if (!hasContentMatch) {
        return undefined;
      }
      const finalScore = (merged.get(card.id) || 0) + Math.max(0, Math.min(0.05, card.confidence || 0));
      const scoreBreakdown: MemoryRecallScoreBreakdown = {
        scopeMatched: true,
        bm25: normalizeScore(bm25Score, bm25Max),
        keyword: normalizeScore(keywordScore, keywordMax),
        embedding: embeddingScore || undefined,
        final: finalScore
      };
      return {
        card,
        score: finalScore,
        reasons: reasonList(card, scoreBreakdown, context),
        selectedByDefault: finalScore >= config.thresholds.selectedByDefaultScore,
        sourceSummary: sourceSummary(card),
        scoreBreakdown
      } as MemorySearchResult;
    })
    .filter(Boolean) as MemorySearchResult[];
  let pendingCount = 0;
  const limited = dedupeSimilar(results.sort((left, right) => right.score - left.score))
    .filter((item) => {
      if (item.card.status !== 'PENDING_VERIFY') {
        return true;
      }
      pendingCount += 1;
      return pendingCount <= config.thresholds.maxPendingVerifyItems;
    })
    .slice(0, input.limit || config.thresholds.maxInjectedItems);
  return limited;
}

export const internalForTests = {
  words,
  scoreCard,
  bm25Scores,
  keywordScores,
  rankScores,
  mergeRankScores,
  inScope
};
