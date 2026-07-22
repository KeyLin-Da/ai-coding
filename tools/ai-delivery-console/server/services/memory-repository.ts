import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  MemoryCandidate,
  MemoryCandidateConfirmInput,
  MemoryCandidateFilter,
  MemoryCandidateStatus,
  MemoryCandidateUpdateInput,
  MemoryCard,
  MemoryCardCreateInput,
  MemoryCardFilter,
  MemoryCardRevision,
  MemoryCardUpdateInput,
  MemoryPage,
  MemoryRecallFilter,
  MemoryRecallRecord,
  RetrospectiveMemoryCandidateInput
} from '../../shared/memory';
import { memoryCandidateStatuses, memoryCardStatuses, memorySourceTypes, memoryTypes } from '../../shared/memory';
import { createId, hashContent } from './workspace';
import {
  assertMemoryPath,
  memoryCardRevisionsDir,
  memoryCandidatesDir,
  memoryCardsDir,
  memoryFilePath,
  memoryIndexPath,
  memoryRecallLedgerPath
} from './memory-paths';

interface MemoryIndexFile {
  version: 1;
  candidateCount: number;
  cardCount: number;
  pendingCandidateCount: number;
  updatedAt: string;
}

interface MemoryRecallLedgerFile {
  version: 1;
  records: MemoryRecallRecord[];
}

export function memoryCardContentHash(card: Pick<MemoryCard, 'statement' | 'type' | 'tags' | 'evidence'>): string {
  return hashContent(JSON.stringify({
    statement: normalizeText(card.statement, 1000),
    type: card.type,
    tags: normalizeStringArray(card.tags).sort(),
    evidence: (card.evidence || []).map((item) => normalizeText(item.quote, 1000)).filter(Boolean)
  }));
}

function withCardHash<T extends MemoryCard>(card: T): T {
  const contentHash = memoryCardContentHash(card);
  return {
    ...card,
    contentHash,
    version: card.version || contentHash.slice(0, 12)
  };
}

function normalizeText(value = '', maxLength = 4000): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  return values.map((item) => normalizeText(String(item || ''), 80)).filter((item) => {
    if (!item || seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}

function asArray<T extends string>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function matchesKeyword(text: string, keyword = ''): boolean {
  const normalized = keyword.trim().toLowerCase();
  return !normalized || text.toLowerCase().includes(normalized);
}

function pageItems<T>(items: T[], page = 1, pageSize = 50): MemoryPage<T> {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const start = (safePage - 1) * safePageSize;
  return {
    items: items.slice(start, start + safePageSize),
    total: items.length,
    page: safePage,
    pageSize: safePageSize
  };
}

async function readJsonFile<T>(absolute: string, fallback: T): Promise<T> {
  const raw = await fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  return raw ? JSON.parse(raw) as T : fallback;
}

async function writeJsonFile(workspaceRoot: string, relativePath: string, value: unknown): Promise<void> {
  const absolute = assertMemoryPath(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temp, absolute);
}

async function listJsonFiles<T>(workspaceRoot: string, relativeDir: string): Promise<T[]> {
  const absoluteDir = assertMemoryPath(workspaceRoot, `${relativeDir}/.keep`);
  const entries = await fs.readdir(path.dirname(absoluteDir), { withFileTypes: true }).catch((error: any) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const values = await Promise.all(
    files.map((entry) => readJsonFile<T | undefined>(path.join(path.dirname(absoluteDir), entry.name), undefined))
  );
  return values.filter(Boolean) as T[];
}

export class MemoryRepository {
  constructor(private readonly workspaceRoot: string) {}

  async listCandidates(filter: MemoryCandidateFilter = {}): Promise<MemoryPage<MemoryCandidate>> {
    const statuses = new Set(asArray(filter.status));
    const items = (await listJsonFiles<MemoryCandidate>(this.workspaceRoot, memoryCandidatesDir()))
      .filter((item) => !filter.projectId || item.projectId === filter.projectId)
      .filter((item) => !filter.requirementId || item.requirementId === filter.requirementId)
      .filter((item) => !statuses.size || statuses.has(item.status))
      .filter((item) => matchesKeyword(`${item.statement} ${item.sourceText} ${item.tags.join(' ')}`, filter.keyword))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return pageItems(items, filter.page, filter.pageSize);
  }

  async listCards(filter: MemoryCardFilter = {}): Promise<MemoryPage<MemoryCard>> {
    const statuses = new Set(asArray(filter.status));
    const items = (await listJsonFiles<MemoryCard>(this.workspaceRoot, memoryCardsDir()))
      .map((item) => withCardHash(item))
      .filter((item) => !filter.projectId || item.projectId === filter.projectId)
      .filter((item) => !statuses.size || statuses.has(item.status))
      .filter((item) => !filter.type || item.type === filter.type)
      .filter((item) => !filter.module || item.appliesTo.modules.includes(filter.module))
      .filter((item) => !filter.stage || item.appliesTo.stages.includes(filter.stage))
      .filter((item) => matchesKeyword(`${item.statement} ${item.tags.join(' ')}`, filter.keyword))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return pageItems(items, filter.page, filter.pageSize);
  }

  async listAllCards(filter: MemoryCardFilter = {}): Promise<MemoryCard[]> {
    const statuses = new Set(asArray(filter.status));
    return (await listJsonFiles<MemoryCard>(this.workspaceRoot, memoryCardsDir()))
      .map((item) => withCardHash(item))
      .filter((item) => !filter.projectId || item.projectId === filter.projectId)
      .filter((item) => !statuses.size || statuses.has(item.status))
      .filter((item) => !filter.type || item.type === filter.type)
      .filter((item) => !filter.module || item.appliesTo.modules.includes(filter.module))
      .filter((item) => !filter.stage || item.appliesTo.stages.includes(filter.stage))
      .filter((item) => matchesKeyword(`${item.statement} ${item.tags.join(' ')}`, filter.keyword))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listRecallRecords(filter: MemoryRecallFilter = {}): Promise<MemoryPage<MemoryRecallRecord>> {
    const records = await this.readRecallLedger();
    const items = records
      .filter((item) => !filter.projectId || item.projectId === filter.projectId)
      .filter((item) => !filter.requirementId || item.requirementId === filter.requirementId)
      .filter((item) => !filter.memoryId || item.memoryId === filter.memoryId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return pageItems(items, filter.page, filter.pageSize);
  }

  async getCandidate(candidateId: string): Promise<MemoryCandidate> {
    const candidate = await readJsonFile<MemoryCandidate | undefined>(
      assertMemoryPath(this.workspaceRoot, memoryFilePath(memoryCandidatesDir(), candidateId)),
      undefined
    );
    if (!candidate) {
      const error = new Error(`候选经验不存在: ${candidateId}`) as Error & { code?: string };
      error.code = 'B71001';
      throw error;
    }
    return candidate;
  }

  async getCard(memoryId: string): Promise<MemoryCard> {
    const card = await readJsonFile<MemoryCard | undefined>(
      assertMemoryPath(this.workspaceRoot, memoryFilePath(memoryCardsDir(), memoryId)),
      undefined
    );
    if (!card) {
      const error = new Error(`项目记忆不存在: ${memoryId}`) as Error & { code?: string };
      error.code = 'B71001';
      throw error;
    }
    return withCardHash(card);
  }

  async listCardRevisions(memoryId: string): Promise<MemoryCardRevision[]> {
    await this.getCard(memoryId);
    return (await listJsonFiles<MemoryCardRevision>(this.workspaceRoot, memoryCardRevisionsDir(memoryId)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveCandidate(input: MemoryCandidate): Promise<MemoryCandidate> {
    const candidate: MemoryCandidate = {
      ...input,
      sourceText: normalizeText(input.sourceText, 4000),
      statement: normalizeText(input.statement, 1000),
      tags: normalizeStringArray(input.tags),
      updatedAt: input.updatedAt || new Date().toISOString()
    };
    await writeJsonFile(this.workspaceRoot, memoryFilePath(memoryCandidatesDir(), candidate.id), candidate);
    await this.rebuildIndex();
    return candidate;
  }

  async upsertCandidateBySource(input: MemoryCandidate): Promise<MemoryCandidate> {
    const existing = (await this.listCandidates({ projectId: input.projectId, pageSize: 200 })).items.find(
      (item) => item.sourceKey === input.sourceKey
    );
    if (existing) {
      return existing;
    }
    return this.saveCandidate(input);
  }

  async updateCandidate(candidateId: string, input: MemoryCandidateUpdateInput): Promise<MemoryCandidate> {
    const candidate = await this.getCandidate(candidateId);
    const statement = input.statement === undefined ? candidate.statement : normalizeText(input.statement, 1000);
    if (!statement) {
      const error = new Error('候选经验描述不能为空') as Error & { code?: string };
      error.code = 'B71002';
      throw error;
    }
    const type = input.type && memoryTypes.includes(input.type) ? input.type : candidate.type;
    const sourceText = input.sourceText === undefined ? candidate.sourceText : normalizeText(input.sourceText, 4000);
    const confidence = input.confidence === undefined
      ? candidate.confidence
      : Math.max(0, Math.min(1, Number(input.confidence || 0)));

    return this.saveCandidate({
      ...candidate,
      statement,
      type,
      sourceText,
      confidence,
      tags: input.tags === undefined ? candidate.tags : normalizeStringArray(input.tags),
      appliesTo: {
        modules: input.appliesTo?.modules === undefined
          ? candidate.appliesTo.modules
          : normalizeStringArray(input.appliesTo.modules),
        stages: input.appliesTo?.stages === undefined
          ? candidate.appliesTo.stages
          : input.appliesTo.stages
      },
      updatedAt: new Date().toISOString()
    });
  }

  async importRetrospectiveCandidates(input: {
    projectId?: string;
    requirementId: string;
    runId: string;
    sourcePath: string;
    sourceArtifactPath?: string;
    candidates: RetrospectiveMemoryCandidateInput[];
  }): Promise<MemoryCandidate[]> {
    const saved: MemoryCandidate[] = [];
    for (const item of input.candidates) {
      const statement = normalizeText(item.statement, 1000);
      if (!statement) {
        continue;
      }
      const now = new Date().toISOString();
      const type = memoryTypes.includes(item.type) ? item.type : 'TECH_EXPERIENCE';
      const evidence = (Array.isArray(item.evidence) ? item.evidence : [])
        .map((evidenceItem) => ({
          sourceType: memorySourceTypes.includes(evidenceItem.sourceType) ? evidenceItem.sourceType : 'RETROSPECTIVE',
          requirementId: normalizeText(evidenceItem.requirementId || input.requirementId, 80),
          path: normalizeText(evidenceItem.path || '', 500) || input.sourcePath,
          quote: normalizeText(evidenceItem.quote || item.sourceText || statement, 1000),
          runId: normalizeText(evidenceItem.runId || input.runId, 120) || input.runId,
          artifactPath: normalizeText(evidenceItem.artifactPath || input.sourceArtifactPath || input.sourcePath, 500)
        }))
        .filter((evidenceItem) => evidenceItem.quote);
      const sourceText = normalizeText(item.sourceText || evidence[0]?.quote || statement, 4000);
      const sourceKey = `retrospective:${input.requirementId}:${hashContent(JSON.stringify({ statement, sourceText, runId: input.runId })).slice(0, 16)}`;
      const candidate: MemoryCandidate = {
        id: createId('memcand'),
        projectId: normalizeText(input.projectId || '', 80) || undefined,
        requirementId: normalizeText(input.requirementId, 80),
        sourceKey,
        sourceType: 'RETROSPECTIVE',
        sourcePath: input.sourcePath,
        sourceRunId: input.runId,
        sourceArtifactPath: input.sourceArtifactPath || input.sourcePath,
        sourceText,
        statement,
        type,
        status: 'PENDING_CONFIRM',
        confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.7))),
        tags: normalizeStringArray(item.tags),
        appliesTo: {
          modules: normalizeStringArray(item.appliesTo?.modules),
          stages: item.appliesTo?.stages?.length ? item.appliesTo.stages : ['TECH_DESIGN']
        },
        evidence: evidence.length
          ? evidence
          : [
              {
                sourceType: 'RETROSPECTIVE',
                requirementId: input.requirementId,
                path: input.sourcePath,
                quote: sourceText,
                runId: input.runId,
                artifactPath: input.sourceArtifactPath || input.sourcePath
              }
            ],
        createdAt: now,
        updatedAt: now
      };
      saved.push(await this.upsertCandidateBySource(candidate));
    }
    return saved;
  }

  async markRetrospectiveCandidatesPendingVerify(requirementId: string, reason: string): Promise<MemoryCandidate[]> {
    const page = await this.listCandidates({
      requirementId,
      status: ['PENDING_CONFIRM', 'PENDING_VERIFY'],
      pageSize: 200
    });
    const updated: MemoryCandidate[] = [];
    for (const candidate of page.items.filter((item) => item.sourceType === 'RETROSPECTIVE')) {
      updated.push(await this.updateCandidateStatus(candidate.id, 'PENDING_VERIFY', reason));
    }
    return updated;
  }

  async confirmCandidate(candidateId: string, input: MemoryCandidateConfirmInput = {}): Promise<MemoryCard> {
    const candidate = await this.getCandidate(candidateId);
    if (!['PENDING_CONFIRM', 'PENDING_VERIFY'].includes(candidate.status)) {
      const error = new Error('当前候选状态不允许确认沉淀') as Error & { code?: string };
      error.code = 'B71002';
      throw error;
    }
    if (input.status === 'PENDING_VERIFY') {
      const error = new Error('待验证候选不能通过确认接口进入项目经验，请先保留为待验证或验证通过后再确认') as Error & { code?: string };
      error.code = 'B71002';
      throw error;
    }
    if (!candidate.evidence.length || !candidate.sourceRunId || !candidate.requirementId) {
      const error = new Error('候选经验来源信息不足，无法沉淀') as Error & { code?: string };
      error.code = 'B71004';
      throw error;
    }
    const now = new Date().toISOString();
    const card = withCardHash({
      id: createId('mem'),
      projectId: candidate.projectId,
      statement: normalizeText(input.statement || candidate.statement, 1000),
      type: input.type || candidate.type,
      status: 'ACTIVE',
      confidence: Math.max(0, Math.min(1, Number(candidate.confidence || 0.5))),
      tags: normalizeStringArray(input.tags?.length ? input.tags : candidate.tags),
      appliesTo: {
        modules: normalizeStringArray(input.appliesTo?.modules?.length ? input.appliesTo.modules : candidate.appliesTo.modules),
        stages: (input.appliesTo?.stages?.length ? input.appliesTo.stages : candidate.appliesTo.stages) || []
      },
      evidence: candidate.evidence,
      sourceCandidateId: candidate.id,
      createdAt: now,
      updatedAt: now
    });
    if (!memoryCardStatuses.includes(card.status)) {
      card.status = 'ACTIVE';
    }
    await writeJsonFile(this.workspaceRoot, memoryFilePath(memoryCardsDir(), card.id), card);
    await this.saveCandidate({
      ...candidate,
      status: 'CONFIRMED',
      confirmedMemoryId: card.id,
      updatedAt: now
    });
    await this.rebuildIndex();
    return card;
  }

  async createManualCard(input: MemoryCardCreateInput): Promise<MemoryCard> {
    const statement = normalizeText(input.statement, 1000);
    if (!statement) {
      const error = new Error('项目经验描述不能为空') as Error & { code?: string };
      error.code = 'B71002';
      throw error;
    }
    const type = memoryTypes.includes(input.type) ? input.type : 'TECH_EXPERIENCE';
    const status = input.status === 'PENDING_VERIFY' ? 'PENDING_VERIFY' : 'ACTIVE';
    const now = new Date().toISOString();
    const requirementId = normalizeText(input.requirementId || '', 80);
    const card = withCardHash({
      id: createId('mem'),
      projectId: normalizeText(input.projectId || '', 80) || undefined,
      statement,
      type,
      status,
      confidence: Math.max(0, Math.min(1, Number(input.confidence ?? (status === 'PENDING_VERIFY' ? 0.45 : 0.8)))),
      tags: normalizeStringArray(input.tags),
      appliesTo: {
        modules: normalizeStringArray(input.appliesTo?.modules),
        stages: input.appliesTo?.stages || []
      },
      evidence: [
        {
          sourceType: 'MANUAL',
          requirementId,
          quote: normalizeText(input.evidenceQuote || statement, 1000)
        }
      ],
      createdAt: now,
      updatedAt: now
    });
    await writeJsonFile(this.workspaceRoot, memoryFilePath(memoryCardsDir(), card.id), card);
    await this.rebuildIndex();
    return card;
  }

  async updateCard(memoryId: string, input: MemoryCardUpdateInput): Promise<MemoryCard> {
    const existing = await this.getCard(memoryId);
    const statement = input.statement === undefined ? existing.statement : normalizeText(input.statement, 1000);
    if (!statement) {
      const error = new Error('项目经验描述不能为空') as Error & { code?: string };
      error.code = 'B71002';
      throw error;
    }
    const status = input.status && memoryCardStatuses.includes(input.status) ? input.status : existing.status;
    const type = input.type && memoryTypes.includes(input.type) ? input.type : existing.type;
    const evidence = [...existing.evidence];
    const evidenceQuote = normalizeText(input.evidenceQuote || '', 1000);
    if (evidenceQuote) {
      evidence.push({
        sourceType: 'MANUAL',
        requirementId: existing.evidence[0]?.requirementId || '',
        quote: evidenceQuote
      });
    }
    const now = new Date().toISOString();
    const next = withCardHash({
      ...existing,
      statement,
      type,
      status,
      confidence: input.confidence === undefined
        ? existing.confidence
        : Math.max(0, Math.min(1, Number(input.confidence || 0))),
      tags: input.tags === undefined ? existing.tags : normalizeStringArray(input.tags),
      appliesTo: {
        modules: input.appliesTo?.modules === undefined
          ? existing.appliesTo.modules
          : normalizeStringArray(input.appliesTo.modules),
        stages: input.appliesTo?.stages === undefined
          ? existing.appliesTo.stages
          : input.appliesTo.stages
      },
      evidence,
      updatedAt: now
    });
    const revision: MemoryCardRevision = {
      id: createId('memrev'),
      memoryId: existing.id,
      projectId: existing.projectId,
      before: existing,
      after: next,
      changeReason: normalizeText(input.changeReason || '', 500) || undefined,
      createdAt: now
    };
    await writeJsonFile(this.workspaceRoot, memoryFilePath(memoryCardRevisionsDir(existing.id), revision.id), revision);
    await writeJsonFile(this.workspaceRoot, memoryFilePath(memoryCardsDir(), next.id), next);
    await this.rebuildIndex();
    return next;
  }

  async updateCandidateStatus(candidateId: string, status: MemoryCandidateStatus, reason = ''): Promise<MemoryCandidate> {
    if (!memoryCandidateStatuses.includes(status)) {
      const error = new Error(`候选经验状态不合法: ${status}`) as Error & { code?: string };
      error.code = 'B71002';
      throw error;
    }
    const candidate = await this.getCandidate(candidateId);
    const next = await this.saveCandidate({
      ...candidate,
      status,
      ignoredReason: reason || candidate.ignoredReason,
      updatedAt: new Date().toISOString()
    });
    await this.rebuildIndex();
    return next;
  }

  async appendRecallRecords(records: MemoryRecallRecord[]): Promise<MemoryRecallRecord[]> {
    if (!records.length) {
      return this.readRecallLedger();
    }
    const existing = await this.readRecallLedger();
    const nextRecords = [...records, ...existing].slice(0, 5000);
    await writeJsonFile(this.workspaceRoot, memoryRecallLedgerPath(), { version: 1, records: nextRecords });
    return nextRecords;
  }

  async readRecallLedger(): Promise<MemoryRecallRecord[]> {
    const absolute = assertMemoryPath(this.workspaceRoot, memoryRecallLedgerPath());
    const file = await readJsonFile<MemoryRecallLedgerFile>(absolute, { version: 1, records: [] });
    return Array.isArray(file.records) ? file.records : [];
  }

  async readIndex(): Promise<MemoryIndexFile> {
    return readJsonFile<MemoryIndexFile>(assertMemoryPath(this.workspaceRoot, memoryIndexPath()), {
      version: 1,
      candidateCount: 0,
      cardCount: 0,
      pendingCandidateCount: 0,
      updatedAt: ''
    });
  }

  async rebuildIndex(): Promise<MemoryIndexFile> {
    const [candidates, cards] = await Promise.all([
      listJsonFiles<MemoryCandidate>(this.workspaceRoot, memoryCandidatesDir()),
      listJsonFiles<MemoryCard>(this.workspaceRoot, memoryCardsDir())
    ]);
    const index: MemoryIndexFile = {
      version: 1,
      candidateCount: candidates.length,
      cardCount: cards.length,
      pendingCandidateCount: candidates.filter((item) => ['PENDING_CONFIRM', 'PENDING_VERIFY'].includes(item.status)).length,
      updatedAt: new Date().toISOString()
    };
    await writeJsonFile(this.workspaceRoot, memoryIndexPath(), index);
    return index;
  }
}

export const internalForTests = {
  normalizeStringArray,
  pageItems
};
