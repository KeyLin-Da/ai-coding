import type { RunRecord, RunStatus } from '@shared/workflow';

export interface TechDesignQuestionRecord {
  id: string;
  time: string;
  requirementId: string;
  question: string;
  summary: string;
  answer: string;
  evidence: string;
  suggestions: string;
  sourcePath?: string;
}

export type TechDesignQuestionDisplayStatus = RunStatus | 'ANSWERED' | 'PENDING_RECORD';

export interface TechDesignQuestionListItem {
  id: string;
  recordId?: string;
  sourcePath?: string;
  question: string;
  summary: string;
  time: string;
  status: TechDesignQuestionDisplayStatus;
  runId?: string;
  runStatus?: RunStatus;
  answer?: TechDesignQuestionRecord;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function summarizeQuestion(question: string) {
  const normalized = normalizeText(question);
  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

function normalizeQuestion(question: string) {
  return normalizeText(question).replace(/[？?。.\s]+$/g, '');
}

function extractMarkedSection(body: string, label: string) {
  const pattern = new RegExp(`\\*\\*${label}[:：]\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*[^*]+[:：]\\*\\*|$)`);
  return (body.match(pattern)?.[1] || '').trim();
}

export function parseTechDesignQuestionRecords(content: string, sourcePath = ''): TechDesignQuestionRecord[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const headings = Array.from(normalized.matchAll(/^##\s+(.+?)\s*$/gm)).filter((match) => normalizeText(match[1] || '').includes('/'));

  return headings
    .map((match, index) => {
      const header = normalizeText(match[1] || '');
      const bodyStart = (match.index || 0) + match[0].length;
      const bodyEnd = headings[index + 1]?.index ?? normalized.length;
      const body = normalized.slice(bodyStart, bodyEnd);
      const questionMatch = body.match(/\*\*问题[:：]\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*]+[:：]\*\*|$)/);
      const question = (questionMatch?.[1] || '').trim();
      if (!question) {
        return undefined;
      }
      const [rawTime = '', rawRequirementId = ''] = header.split('/').map((item) => item.trim());
      const answer = extractMarkedSection(body, '回答');
      const evidence = extractMarkedSection(body, '依据');
      const suggestions = extractMarkedSection(body, '后续建议');
      return {
        id: `${rawTime || 'unknown'}-${rawRequirementId || index}-${index}`,
        time: rawTime,
        requirementId: rawRequirementId,
        question,
        summary: summarizeQuestion(question),
        answer,
        evidence,
        suggestions,
        sourcePath
      };
    })
    .filter((item): item is TechDesignQuestionRecord => Boolean(item));
}

export function buildTechDesignQuestionItems(records: TechDesignQuestionRecord[], runs: RunRecord[]): TechDesignQuestionListItem[] {
  const designQuestionRuns = runs
    .filter((run) => run.actionType === 'DESIGN_QUESTION')
    .sort((left, right) => Date.parse(left.startedAt || '') - Date.parse(right.startedAt || ''));
  const usedRecordIndexes = new Set<number>();
  const items = designQuestionRuns.map((run) => {
    const question = typeof run.params?.question === 'string' ? run.params.question.trim() : '';
    const normalizedQuestion = normalizeQuestion(question);
    const outputPath = typeof run.params?.outputPath === 'string' ? run.params.outputPath.trim() : '';
    const answerIndex = records.findIndex((record, index) => {
      if (usedRecordIndexes.has(index)) {
        return false;
      }
      const sameQuestion = normalizeQuestion(record.question) === normalizedQuestion;
      const sameOutput = Boolean(outputPath && record.sourcePath === outputPath);
      const legacyAggregate = record.sourcePath?.endsWith('/questions.md');
      return (sameOutput && (!legacyAggregate || sameQuestion)) || (!outputPath && sameQuestion);
    });
    const answer = answerIndex >= 0 ? records[answerIndex] : undefined;
    if (answerIndex >= 0) {
      usedRecordIndexes.add(answerIndex);
    }
    return {
      id: run.id,
      recordId: answer?.id,
      sourcePath: answer?.sourcePath,
      question,
      summary: summarizeQuestion(question),
      time: run.startedAt,
      status: answer ? 'ANSWERED' : run.status === 'SUCCEEDED' || run.status === 'COMPLETED' ? 'PENDING_RECORD' : run.status,
      runId: run.id,
      runStatus: run.status,
      answer
    };
  });

  records.forEach((record, index) => {
    if (usedRecordIndexes.has(index)) {
      return;
    }
    items.push({
      id: record.id,
      recordId: record.id,
      sourcePath: record.sourcePath,
      question: record.question,
      summary: record.summary,
      time: record.time,
      status: 'ANSWERED',
      answer: record
    });
  });

  return items.sort((left, right) => Date.parse(left.time || '') - Date.parse(right.time || ''));
}
