import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequirementWorkflow, TechDesignInputLedger, TechDesignInputLedgerEntry, TechDesignInputLedgerEntryType } from '../../shared/workflow';
import { assertInsideWorkspace, createId, hashContent, normalizeRequirementId } from './workspace';

interface ConsumeTechDesignInputLedgerInput {
  questionPaths?: string[];
  sourceFilePaths?: string[];
  clarification?: string;
  runId: string;
}

const emptyLedger: TechDesignInputLedger = {
  version: 1,
  entries: []
};

export function techDesignInputLedgerPath(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/technical-design/input-ledger.json`;
}

function normalizeArtifactPath(value: string): string {
  return String(value || '').trim().replace(/\\/g, '/');
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(normalizeArtifactPath).filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function normalizeEntry(entry: Partial<TechDesignInputLedgerEntry>): TechDesignInputLedgerEntry | undefined {
  const type = String(entry.type || '') as TechDesignInputLedgerEntryType;
  if (!['QUESTION', 'SOURCE_FILE', 'CLARIFICATION'].includes(type)) {
    return undefined;
  }
  const consumedAt = String(entry.consumedAt || '').trim();
  const consumedRunId = String(entry.consumedRunId || '').trim();
  if (!consumedAt || !consumedRunId) {
    return undefined;
  }
  return {
    id: String(entry.id || createId('input-ledger')),
    type,
    path: entry.path ? normalizeArtifactPath(entry.path) : undefined,
    contentHash: entry.contentHash ? String(entry.contentHash) : undefined,
    consumedAt,
    consumedRunId
  };
}

export async function readTechDesignInputLedger(workspaceRoot: string, requirementId: string): Promise<TechDesignInputLedger> {
  const absolute = assertInsideWorkspace(workspaceRoot, techDesignInputLedgerPath(requirementId));
  const raw = await fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  if (!raw) {
    return { ...emptyLedger, entries: [] };
  }
  const parsed = JSON.parse(raw) as Partial<TechDesignInputLedger>;
  return {
    version: 1,
    entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry).filter(Boolean) as TechDesignInputLedgerEntry[] : []
  };
}

async function writeTechDesignInputLedger(workspaceRoot: string, requirementId: string, ledger: TechDesignInputLedger): Promise<TechDesignInputLedger> {
  const absolute = assertInsideWorkspace(workspaceRoot, techDesignInputLedgerPath(requirementId));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify({ version: 1, entries: ledger.entries }, null, 2)}\n`, 'utf8');
  return ledger;
}

export function consumedQuestionPathsFromLedger(ledger: TechDesignInputLedger): string[] {
  return uniqueNonEmpty(
    ledger.entries
      .filter((entry) => entry.type === 'QUESTION' && entry.path)
      .map((entry) => entry.path || '')
  );
}

export async function mergeTechDesignInputLedgerIntoWorkflow(workspaceRoot: string, workflow: RequirementWorkflow): Promise<RequirementWorkflow> {
  const ledger = await readTechDesignInputLedger(workspaceRoot, workflow.requirementId);
  const consumedQuestionPaths = uniqueNonEmpty([
    ...(workflow.techDesignConsumedQuestionPaths || []),
    ...consumedQuestionPathsFromLedger(ledger)
  ]);
  return {
    ...workflow,
    techDesignConsumedQuestionPaths: consumedQuestionPaths
  };
}

function hasEntry(entries: TechDesignInputLedgerEntry[], type: TechDesignInputLedgerEntryType, key: string): boolean {
  return entries.some((entry) => {
    if (entry.type !== type) {
      return false;
    }
    return type === 'CLARIFICATION' ? entry.contentHash === key : entry.path === key;
  });
}

export async function consumeTechDesignInputLedger(
  workspaceRoot: string,
  requirementId: string,
  input: ConsumeTechDesignInputLedgerInput
): Promise<TechDesignInputLedger> {
  const ledger = await readTechDesignInputLedger(workspaceRoot, requirementId);
  const now = new Date().toISOString();
  const nextEntries = [...ledger.entries];

  function addPathEntry(type: 'QUESTION' | 'SOURCE_FILE', filePath: string) {
    const normalized = normalizeArtifactPath(filePath);
    if (!normalized || hasEntry(nextEntries, type, normalized)) {
      return;
    }
    nextEntries.push({
      id: createId('input-ledger'),
      type,
      path: normalized,
      consumedAt: now,
      consumedRunId: input.runId
    });
  }

  uniqueNonEmpty(input.questionPaths || []).forEach((filePath) => addPathEntry('QUESTION', filePath));
  uniqueNonEmpty(input.sourceFilePaths || []).forEach((filePath) => addPathEntry('SOURCE_FILE', filePath));

  const clarification = String(input.clarification || '').trim();
  if (clarification) {
    const contentHash = hashContent(clarification);
    if (!hasEntry(nextEntries, 'CLARIFICATION', contentHash)) {
      nextEntries.push({
        id: createId('input-ledger'),
        type: 'CLARIFICATION',
        contentHash,
        consumedAt: now,
        consumedRunId: input.runId
      });
    }
  }

  if (nextEntries.length === ledger.entries.length) {
    return ledger;
  }
  return writeTechDesignInputLedger(workspaceRoot, requirementId, { version: 1, entries: nextEntries });
}
