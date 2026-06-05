import fs from 'node:fs/promises';
import type { RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { assertInsideWorkspace, normalizeRequirementId } from './workspace';

export interface DeleteTechDesignQuestionInput {
  id?: string;
  recordId?: string;
  runId?: string;
  sourcePath?: string;
  question?: string;
}

interface LegacyRecordBlock {
  id: string;
  question: string;
  start: number;
  end: number;
}

function normalizePath(filePath = ''): string {
  return filePath.trim().replace(/\\/g, '/');
}

function normalizeText(value = ''): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeQuestion(question = ''): string {
  return normalizeText(question).replace(/[？?。.\s]+$/g, '');
}

function legacyQuestionPath(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/technical-design/questions.md`;
}

function questionDirectoryPrefix(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/technical-design/questions/`;
}

function assertQuestionRecordPath(workspaceRoot: string, requirementId: string, filePath: string): string {
  const normalized = normalizePath(filePath);
  const legacyPath = legacyQuestionPath(requirementId);
  const questionPrefix = questionDirectoryPrefix(requirementId);
  if (normalized !== legacyPath && !(normalized.startsWith(questionPrefix) && /\.md$/i.test(normalized))) {
    throw new Error(`不是有效的技术方案答疑记录路径: ${filePath}`);
  }
  return assertInsideWorkspace(workspaceRoot, normalized);
}

function parseLegacyRecordBlocks(content: string): LegacyRecordBlock[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const headings = Array.from(normalized.matchAll(/^##\s+(.+?)\s*$/gm));
  return headings
    .map((match, index) => {
      const header = normalizeText(match[1] || '');
      const bodyStart = (match.index || 0) + match[0].length;
      const bodyEnd = headings[index + 1]?.index ?? normalized.length;
      const body = normalized.slice(bodyStart, bodyEnd);
      const question = (body.match(/\*\*问题[:：]\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*]+[:：]\*\*|\n##\s+|$)/)?.[1] || '').trim();
      const [rawTime = '', rawRequirementId = ''] = header.split('/').map((item) => item.trim());
      return {
        id: `${rawTime || 'unknown'}-${rawRequirementId || index}-${index}`,
        question,
        start: match.index || 0,
        end: bodyEnd
      };
    })
    .filter((item) => Boolean(item.question));
}

function matchesRecord(block: LegacyRecordBlock, input: DeleteTechDesignQuestionInput): boolean {
  const recordIds = [input.recordId, input.id].filter((item): item is string => Boolean(item));
  const sameId = recordIds.some((id) => id === block.id || id.endsWith(`#${block.id}`));
  const sameQuestion = Boolean(input.question && normalizeQuestion(input.question) === normalizeQuestion(block.question));
  return sameId || sameQuestion;
}

async function deleteLegacyRecord(workspaceRoot: string, requirementId: string, input: DeleteTechDesignQuestionInput): Promise<void> {
  const absolute = assertQuestionRecordPath(workspaceRoot, requirementId, legacyQuestionPath(requirementId));
  const content = await fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  if (!content) {
    return;
  }
  const normalized = content.replace(/\r\n/g, '\n');
  const blocks = parseLegacyRecordBlocks(normalized);
  const block = blocks.find((item) => matchesRecord(item, input));
  if (!block) {
    return;
  }
  const before = normalized.slice(0, block.start).replace(/\s*$/g, '\n\n');
  const after = normalized.slice(block.end).replace(/^\s+/g, '');
  const nextContent = `${before}${after}`.replace(/\n{3,}/g, '\n\n');
  await fs.writeFile(absolute, nextContent, 'utf8');
}

function shouldRemoveRun(run: RunRecord, input: DeleteTechDesignQuestionInput): boolean {
  if (run.actionType !== 'DESIGN_QUESTION') {
    return false;
  }
  if (input.runId && run.id === input.runId) {
    return true;
  }
  const runQuestion = typeof run.params?.question === 'string' ? run.params.question : '';
  const runOutputPath = typeof run.params?.outputPath === 'string' ? normalizePath(run.params.outputPath) : '';
  const inputSourcePath = normalizePath(input.sourcePath);
  const sameOutput = Boolean(inputSourcePath && runOutputPath && inputSourcePath === runOutputPath);
  const sameQuestion = Boolean(input.question && normalizeQuestion(input.question) === normalizeQuestion(runQuestion));
  return (sameOutput && (!input.question || sameQuestion)) || (!inputSourcePath && sameQuestion);
}

export async function deleteTechDesignQuestionRecord(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: DeleteTechDesignQuestionInput
): Promise<RequirementWorkflow> {
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const sourcePath = normalizePath(input.sourcePath);
  if (sourcePath) {
    const legacyPath = legacyQuestionPath(requirementId);
    if (sourcePath === legacyPath) {
      await deleteLegacyRecord(workspaceRoot, requirementId, input);
    } else {
      const absolute = assertQuestionRecordPath(workspaceRoot, requirementId, sourcePath);
      await fs.unlink(absolute).catch((error: any) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      });
    }
  }

  return {
    ...workflow,
    runs: workflow.runs.filter((run) => !shouldRemoveRun(run, input))
  };
}

export const internalForTests = {
  parseLegacyRecordBlocks,
  deleteLegacyRecord,
  shouldRemoveRun
};
