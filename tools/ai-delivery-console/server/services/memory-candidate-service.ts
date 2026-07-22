import fs from 'node:fs/promises';
import type { MemoryAppliesTo, MemoryCandidate, MemorySourceType, MemoryType } from '../../shared/memory';
import type { RequirementWorkflow, RunRecord, WorkflowStage } from '../../shared/workflow';
import { createId, hashContent, normalizeRequirementId, assertInsideWorkspace } from './workspace';
import { MemoryRepository } from './memory-repository';
import { listTechDesignAnnotations } from './tech-design-annotations';

interface ConsumedMemorySource {
  sourceType: MemorySourceType;
  sourceKey: string;
  path?: string;
  text: string;
  quote: string;
  artifactPath?: string;
}

function normalizeText(value = '', maxLength = 2000): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function containsQuestion(value: string): boolean {
  return /[?？]|是否|是不是|能不能|要不要|会不会|可不可以/.test(value);
}

function extractTags(text: string, workflow: RequirementWorkflow): string[] {
  const tags = new Set<string>();
  const lower = text.toLowerCase();
  for (const keyword of ['nacos', 'redis', 'rocketmq', 'mapstruct', 'mybatis', 'mybatis-plus', 'feign', 'lock4j', '多租户']) {
    if (lower.includes(keyword.toLowerCase())) {
      tags.add(keyword);
    }
  }
  for (const project of workflow.projects || []) {
    const name = project.name || project.path;
    if (name && lower.includes(name.toLowerCase())) {
      tags.add(name);
    }
  }
  return [...tags].slice(0, 12);
}

function inferMemoryType(text: string): MemoryType {
  if (containsQuestion(text)) {
    return 'TECH_HYPOTHESIS';
  }
  if (/风险|注意|不要|不能|避免|不支持|异常|失败/.test(text)) {
    return 'RISK_LESSON';
  }
  if (/业务|规则|口径|流程/.test(text)) {
    return 'BUSINESS_RULE';
  }
  return 'TECH_EXPERIENCE';
}

function inferStatement(source: ConsumedMemorySource): string {
  const text = normalizeText(source.text, 500);
  if (containsQuestion(text)) {
    return `待验证：${text.replace(/[?？]+$/g, '')}`;
  }
  if (/不要|不能|不支持|避免/.test(text)) {
    return text;
  }
  if (source.sourceType === 'CLARIFICATION') {
    return `技术方案补充约束：${text}`;
  }
  return text;
}

function appliesTo(workflow: RequirementWorkflow, stage: WorkflowStage = 'TECH_DESIGN'): MemoryAppliesTo {
  return {
    modules: (workflow.projects || []).map((project) => project.name || project.path).filter(Boolean),
    stages: [stage]
  };
}

async function readSourceFile(workspaceRoot: string, relativePath: string): Promise<string> {
  const absolute = assertInsideWorkspace(workspaceRoot, relativePath);
  const raw = await fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  return normalizeText(raw.replace(/^#.*$/gm, ' '), 1200);
}

async function consumedSourcesForRun(workspaceRoot: string, workflow: RequirementWorkflow, run: RunRecord): Promise<ConsumedMemorySource[]> {
  const snapshot = run.techDesignInputSnapshot;
  const sources: ConsumedMemorySource[] = [];
  const requirementId = normalizeRequirementId(workflow.requirementId);

  if (snapshot?.clarification) {
    const text = normalizeText(snapshot.clarification, 1200);
    sources.push({
      sourceType: 'CLARIFICATION',
      sourceKey: `${requirementId}:${run.id}:clarification:${hashContent(text)}`,
      text,
      quote: text
    });
  }

  for (const questionPath of snapshot?.questionPaths || []) {
    const text = await readSourceFile(workspaceRoot, questionPath);
    if (!text) {
      continue;
    }
    sources.push({
      sourceType: 'QUESTION',
      sourceKey: `${requirementId}:${run.id}:question:${questionPath}`,
      path: questionPath,
      text,
      quote: text.slice(0, 300)
    });
  }

  const annotationList = await listTechDesignAnnotations(workspaceRoot, requirementId).catch(() => ({ annotations: [] }));
  const annotationIdSet = new Set(snapshot?.annotationIds || []);
  for (const annotation of annotationList.annotations || []) {
    const wasConsumed = annotation.consumedRunId === run.id || annotationIdSet.has(annotation.id);
    if (!wasConsumed) {
      continue;
    }
    const text = normalizeText([annotation.comment, ...(annotation.replies || []).map((reply) => reply.content)].join(' '), 1200);
    if (!text) {
      continue;
    }
    sources.push({
      sourceType: 'ANNOTATION',
      sourceKey: `${requirementId}:${run.id}:annotation:${annotation.id}`,
      path: annotation.artifactPath,
      artifactPath: annotation.artifactPath,
      text,
      quote: normalizeText(annotation.selectedText || annotation.comment, 300)
    });
  }
  return sources;
}

function candidateFromSource(projectId: string | undefined, workflow: RequirementWorkflow, run: RunRecord, source: ConsumedMemorySource): MemoryCandidate | undefined {
  const sourceText = normalizeText(source.text, 1600);
  if (sourceText.length < 8) {
    return undefined;
  }
  const statement = inferStatement(source);
  const now = new Date().toISOString();
  const status = containsQuestion(sourceText) ? 'PENDING_VERIFY' : 'PENDING_CONFIRM';
  const type = inferMemoryType(sourceText);
  return {
    id: createId('cand'),
    projectId,
    requirementId: normalizeRequirementId(workflow.requirementId),
    sourceKey: source.sourceKey,
    sourceType: source.sourceType,
    sourcePath: source.path,
    sourceRunId: run.id,
    sourceArtifactPath: source.artifactPath || workflow.techDesignDocument || workflow.stages.TECH_DESIGN.artifactPath,
    sourceText,
    statement,
    type,
    status,
    confidence: status === 'PENDING_VERIFY' ? 0.45 : 0.72,
    tags: extractTags(sourceText, workflow),
    appliesTo: appliesTo(workflow),
    evidence: [
      {
        sourceType: source.sourceType,
        requirementId: normalizeRequirementId(workflow.requirementId),
        path: source.path,
        quote: source.quote || sourceText.slice(0, 300),
        runId: run.id,
        artifactPath: source.artifactPath
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

export async function extractMemoryCandidatesForDesignRun(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  projectId?: string
): Promise<MemoryCandidate[]> {
  if (run.actionType !== 'DESIGN_GENERATE' || !run.techDesignInputSnapshot || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return [];
  }
  const repository = new MemoryRepository(workspaceRoot);
  const sources = await consumedSourcesForRun(workspaceRoot, workflow, run);
  const candidates: MemoryCandidate[] = [];
  for (const source of sources) {
    const candidate = candidateFromSource(projectId, workflow, run, source);
    if (!candidate) {
      continue;
    }
    candidates.push(await repository.upsertCandidateBySource(candidate));
  }
  return candidates;
}

export const internalForTests = {
  containsQuestion,
  inferStatement,
  extractTags,
  candidateFromSource
};
