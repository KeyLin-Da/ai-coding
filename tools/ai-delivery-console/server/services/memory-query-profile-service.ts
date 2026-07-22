import fs from 'node:fs/promises';
import path from 'node:path';
import type { ActionType, RequirementWorkflow, WorkflowStage } from '../../shared/workflow';
import type { MemoryQueryProfile, MemorySearchConfig } from '../../shared/memory';
import { assertInsideWorkspace, hashContent } from './workspace';
import { defaultMemorySearchConfig } from './memory-search-config';

export interface MemoryQueryProfileInput {
  actionType: ActionType;
  stage?: WorkflowStage;
  runIntent?: string;
  sourceFilePaths?: string[];
  clarification?: string;
  title?: string;
}

function normalizeText(value = '', maxLength = 4000): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function uniqueLimit(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value, 120);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function splitCamelAndSnake(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

export function profileWords(value = ''): string[] {
  const normalized = value.toLowerCase();
  const ascii = normalized.match(/[a-z0-9_.-]{2,}/g) || [];
  const asciiParts = ascii.flatMap(splitCamelAndSnake);
  const cjk = Array.from(normalized.matchAll(/[\u4e00-\u9fa5]{2,12}/g)).flatMap((match) => {
    const text = match[0];
    const parts: string[] = [text];
    for (let index = 0; index < text.length - 1; index += 1) {
      parts.push(text.slice(index, index + 2));
    }
    for (let index = 0; index < text.length - 3; index += 1) {
      parts.push(text.slice(index, index + 4));
    }
    return parts;
  });
  return uniqueLimit([...ascii, ...asciiParts, ...cjk], 200);
}

function shouldSkipSource(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  return [
    'memory-recall/',
    '/memory-recall/',
    'docs/memory/',
    '/workflow/runs/',
    '/reports/',
    'recall-ledger',
    'run-report',
    'vitest-results',
    'junit/index.html'
  ].some((pattern) => normalized.includes(pattern));
}

function importantLines(content: string, limit: number): string[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const priority = lines.filter((line) =>
    /^#{1,4}\s+/.test(line)
    || /必须|不得|禁止|需要|应当|应该|风险|约束|规则|边界|SHALL|MUST|SHOULD/i.test(line)
    || /\|.+\|/.test(line)
  );
  return uniqueLimit([...priority, ...lines], limit);
}

function extractTechnicalEntities(text: string, limit: number): string[] {
  const matches = text.match(/\b[A-Za-z][A-Za-z0-9]*(?:[_.-][A-Za-z0-9]+)*\b/g) || [];
  const suffixMatches = matches.filter((item) =>
    /(Service|Controller|Mapper|Client|Repository|DTO|VO|Entity|Config|Table|Api|API|Id|Code)$/i.test(item)
    || item.includes('.')
    || item.includes('_')
    || item.includes('-')
  );
  return uniqueLimit([...suffixMatches, ...matches], limit);
}

function extractConstraints(text: string, limit: number): string[] {
  return uniqueLimit(
    text
      .split(/[。；;\n\r]+/)
      .map((item) => item.trim())
      .filter((item) => /必须|不得|禁止|不能|需要|应当|应该|只允许|避免|兼容|风险|边界|SHALL|MUST|SHOULD/i.test(item)),
    limit
  );
}

function extractBusinessTerms(text: string, limit: number): string[] {
  const headingTerms = Array.from(text.matchAll(/^#{1,4}\s+(.+)$/gm)).map((match) => match[1]);
  const cjkTerms = Array.from(text.matchAll(/[\u4e00-\u9fa5]{2,10}/g)).map((match) => match[0]);
  const weighted = [...headingTerms, ...cjkTerms.filter((term) => !/的|了|是|和|以及|或者|一个|当前|系统|用户/.test(term))];
  return uniqueLimit(weighted, limit);
}

async function readProfileSource(workspaceRoot: string, relativePath: string, config: MemorySearchConfig): Promise<{ path: string; content: string } | undefined> {
  const normalized = String(relativePath || '').trim().replace(/\\/g, '/');
  if (!normalized || shouldSkipSource(normalized)) {
    return undefined;
  }
  const absolute = assertInsideWorkspace(workspaceRoot, normalized);
  const stat = await fs.stat(absolute).catch((error: any) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!stat || !stat.isFile()) {
    return undefined;
  }
  const bytes = await fs.readFile(absolute);
  const sliced = bytes.subarray(0, config.sourceLimits.maxFileBytes);
  return {
    path: normalized,
    content: sliced.toString('utf8')
  };
}

export async function buildMemoryQueryProfile(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: MemoryQueryProfileInput,
  config: MemorySearchConfig = defaultMemorySearchConfig()
): Promise<MemoryQueryProfile> {
  const modules = (workflow.projects || []).map((project) => project.name || project.path).filter(Boolean);
  const baseParts = [
    input.title || workflow.title,
    input.runIntent || input.actionType,
    input.clarification || workflow.techDesignClarification || workflow.prdClarification || ''
  ].filter(Boolean);
  const sources: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;
  for (const filePath of (input.sourceFilePaths || []).slice(0, config.sourceLimits.maxFiles)) {
    const source = await readProfileSource(workspaceRoot, filePath, config);
    if (!source) {
      continue;
    }
    const size = Buffer.byteLength(source.content);
    if (totalBytes + size > config.sourceLimits.maxTotalBytes) {
      break;
    }
    sources.push(source);
    totalBytes += size;
  }

  const sourceSnippets = uniqueLimit(
    sources.flatMap((source) => importantLines(source.content, 8).map((line) => `${path.posix.basename(source.path)}: ${line}`)),
    config.sourceLimits.maxSourceSnippets
  );
  const sourceText = [baseParts.join('\n'), ...sources.map((source) => source.content)].join('\n');
  const businessTerms = extractBusinessTerms(sourceText, config.sourceLimits.maxBusinessTerms);
  const technicalEntities = extractTechnicalEntities(sourceText, config.sourceLimits.maxTechnicalEntities);
  const constraints = extractConstraints(sourceText, config.sourceLimits.maxPhrases);
  const intentSummary = normalizeText([input.title || workflow.title, input.runIntent, input.clarification].filter(Boolean).join('；'), 500)
    || normalizeText(sourceSnippets.slice(0, 3).join('；'), 500)
    || workflow.title;
  const sourceHash = hashContent(JSON.stringify({
    baseParts,
    paths: sources.map((source) => source.path),
    sourceHashes: sources.map((source) => hashContent(source.content))
  }));
  const profileWithoutHash = {
    requirementId: workflow.requirementId,
    actionType: input.actionType,
    stage: input.stage || workflow.currentStage,
    title: input.title || workflow.title,
    intentSummary,
    modules,
    businessTerms,
    technicalEntities,
    constraints,
    sourceSnippets,
    sourceHash
  };
  return {
    ...profileWithoutHash,
    queryProfileHash: hashContent(JSON.stringify(profileWithoutHash))
  };
}

export const internalForTests = {
  shouldSkipSource,
  profileWords,
  extractBusinessTerms,
  extractTechnicalEntities,
  extractConstraints
};
