import path from 'node:path';
import { assertInsideWorkspace, normalizeRequirementId } from './workspace';

export function memoryRootPath(): string {
  return 'docs/memory';
}

export function memoryCardsDir(): string {
  return `${memoryRootPath()}/cards`;
}

export function memoryCandidatesDir(): string {
  return `${memoryRootPath()}/candidates`;
}

export function memoryRecallsDir(): string {
  return `${memoryRootPath()}/recalls`;
}

export function memoryRevisionsDir(): string {
  return `${memoryRootPath()}/revisions`;
}

export function memoryCardRevisionsDir(memoryId: string): string {
  const safeId = String(memoryId || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
  return `${memoryRevisionsDir()}/${safeId}`;
}

export function memorySnapshotsDir(): string {
  return `${memoryRootPath()}/snapshots`;
}

export function memoryIndexPath(): string {
  return `${memoryRootPath()}/index.json`;
}

export function memoryRecallLedgerPath(): string {
  return `${memoryRootPath()}/recall-ledger.json`;
}

export function memoryEmbeddingIndexPath(): string {
  return `${memoryRootPath()}/embedding-index.json`;
}

export function requirementMemoryRecallDir(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/memory-recall`;
}

export function requirementMemoryRecallPath(requirementId: string, runId: string): string {
  const safeRunId = String(runId || 'run').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
  return `${requirementMemoryRecallDir(requirementId)}/${safeRunId}.md`;
}

export function assertMemoryPath(workspaceRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  if (!normalized.startsWith('docs/memory/') && !/^docs\/[^/]+\/memory-recall\//.test(normalized)) {
    const error = new Error(`记忆路径不允许访问: ${relativePath}`) as Error & { code?: string };
    error.code = 'B71003';
    throw error;
  }
  return assertInsideWorkspace(workspaceRoot, normalized);
}

export function memoryFilePath(dir: string, id: string): string {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
  return path.posix.join(dir, `${safeId}.json`);
}
