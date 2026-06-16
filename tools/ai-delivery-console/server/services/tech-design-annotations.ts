import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  TechDesignAnnotation,
  TechDesignAnnotationCreateInput,
  TechDesignAnnotationList,
  TechDesignAnnotationStatus,
  TechDesignAnnotationStatusInput
} from '../../shared/workflow';
import { assertInsideWorkspace, createId, hashContent, normalizeRequirementId } from './workspace';
import { readTechDesignVersionContent } from './tech-design-versions';

interface AnnotationIndexFile {
  version: 1;
  annotations: TechDesignAnnotation[];
}

interface WriteOptions {
  expectedHash?: string;
}

const emptyIndex: AnnotationIndexFile = {
  version: 1,
  annotations: []
};

function annotationsDir(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/technical-design/annotations`;
}

export function techDesignAnnotationIndexPath(requirementId: string): string {
  return `${annotationsDir(requirementId)}/index.json`;
}

export function techDesignAnnotationSummaryPath(requirementId: string): string {
  return `${annotationsDir(requirementId)}/comments.md`;
}

function validStatus(value: unknown): value is TechDesignAnnotationStatus {
  return ['OPEN', 'RESOLVED', 'CARRIED_FORWARD', 'STALE'].includes(String(value));
}

function normalizeText(value: string, maxLength: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function readIndex(workspaceRoot: string, requirementId: string): Promise<{ index: AnnotationIndexFile; hash: string }> {
  const absolute = assertInsideWorkspace(workspaceRoot, techDesignAnnotationIndexPath(requirementId));
  const raw = await fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  if (!raw) {
    return {
      index: { ...emptyIndex, annotations: [] },
      hash: hashContent('')
    };
  }
  const parsed = JSON.parse(raw) as Partial<AnnotationIndexFile>;
  return {
    index: {
      version: 1,
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : []
    },
    hash: hashContent(raw)
  };
}

async function writeIndex(
  workspaceRoot: string,
  requirementId: string,
  index: AnnotationIndexFile,
  options: WriteOptions = {}
): Promise<{ hash: string }> {
  const current = await readIndex(workspaceRoot, requirementId);
  if (options.expectedHash && current.hash !== options.expectedHash) {
    const error = new Error('批注已被外部修改，请刷新后重试');
    (error as any).code = 'ANNOTATION_CONFLICT';
    (error as any).currentHash = current.hash;
    throw error;
  }
  const absolute = assertInsideWorkspace(workspaceRoot, techDesignAnnotationIndexPath(requirementId));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const content = `${JSON.stringify({ version: 1, annotations: index.annotations }, null, 2)}\n`;
  await fs.writeFile(absolute, content, 'utf8');
  return { hash: hashContent(content) };
}

function annotationIncludedInSummary(annotation: TechDesignAnnotation): boolean {
  return !annotation.consumedAt && annotation.includeInNextGeneration && ['OPEN', 'CARRIED_FORWARD', 'STALE'].includes(annotation.status);
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderSummary(requirementId: string, annotations: TechDesignAnnotation[]): string {
  const included = annotations.filter(annotationIncludedInSummary);
  const lines = [
    `# 技术方案批注摘要`,
    '',
    `需求编号: ${normalizeRequirementId(requirementId)}`,
    `生成时间: ${new Date().toISOString()}`,
    '',
    included.length ? `以下批注将作为下一次技术方案生成的补充输入。` : `暂无需要纳入下一次技术方案生成的批注。`,
    ''
  ];
  for (const [index, annotation] of included.entries()) {
    lines.push(`## ${index + 1}. ${annotation.status} / ${annotation.versionId}`);
    lines.push('');
    lines.push(`- 选中文案: ${escapeMarkdown(annotation.selectedText)}`);
    lines.push(`- 批注意见: ${escapeMarkdown(annotation.comment)}`);
    lines.push(`- 原始版本: ${annotation.versionNo ? `v${annotation.versionNo}` : annotation.versionId}`);
    lines.push(`- 标题路径: ${annotation.anchor.headingPath.join(' > ') || '-'}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export async function rebuildTechDesignAnnotationSummary(workspaceRoot: string, requirementId: string): Promise<TechDesignAnnotationList> {
  const { index, hash } = await readIndex(workspaceRoot, requirementId);
  const summaryPath = techDesignAnnotationSummaryPath(requirementId);
  const absolute = assertInsideWorkspace(workspaceRoot, summaryPath);
  if (index.annotations.some(annotationIncludedInSummary)) {
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, renderSummary(requirementId, index.annotations), 'utf8');
  } else {
    await fs.rm(absolute, { force: true });
  }
  return {
    annotations: index.annotations,
    hash,
    summaryPath
  };
}

export async function listTechDesignAnnotations(workspaceRoot: string, requirementId: string): Promise<TechDesignAnnotationList> {
  const { index, hash } = await readIndex(workspaceRoot, requirementId);
  return {
    annotations: index.annotations,
    hash,
    summaryPath: techDesignAnnotationSummaryPath(requirementId)
  };
}

export async function createTechDesignAnnotation(
  workspaceRoot: string,
  requirementId: string,
  input: TechDesignAnnotationCreateInput & WriteOptions
): Promise<TechDesignAnnotationList> {
  const selectedText = normalizeText(input.selectedText, 1000);
  const comment = normalizeText(input.comment, 2000);
  if (!selectedText) {
    throw new Error('请选择需要批注的文案');
  }
  if (!comment) {
    throw new Error('请输入批注内容');
  }
  const versionContent = await readTechDesignVersionContent(workspaceRoot, requirementId, input.versionId);
  const { index } = await readIndex(workspaceRoot, requirementId);
  const now = new Date().toISOString();
  const annotation: TechDesignAnnotation = {
    id: createId('annotation'),
    requirementId: normalizeRequirementId(requirementId),
    artifactPath: versionContent.version.artifactPath,
    versionId: versionContent.version.id,
    versionNo: versionContent.version.versionNo,
    versionSource: versionContent.version.source,
    contentHash: versionContent.version.contentHash || hashContent(versionContent.content),
    selectedText,
    anchor: {
      plainStart: Math.max(0, Number(input.anchor?.plainStart || 0)),
      plainEnd: Math.max(0, Number(input.anchor?.plainEnd || 0)),
      prefixText: normalizeText(input.anchor?.prefixText || '', 200),
      suffixText: normalizeText(input.anchor?.suffixText || '', 200),
      headingPath: Array.isArray(input.anchor?.headingPath) ? input.anchor.headingPath.map((item) => normalizeText(item, 100)).filter(Boolean) : [],
      occurrence: Math.max(1, Number(input.anchor?.occurrence || 1))
    },
    comment,
    status: 'OPEN',
    includeInNextGeneration: input.includeInNextGeneration !== false,
    createdAt: now,
    updatedAt: now
  };
  const nextIndex = {
    version: 1 as const,
    annotations: [annotation, ...index.annotations]
  };
  await writeIndex(workspaceRoot, requirementId, nextIndex, { expectedHash: input.expectedHash });
  return rebuildTechDesignAnnotationSummary(workspaceRoot, requirementId);
}

export async function updateTechDesignAnnotationStatus(
  workspaceRoot: string,
  requirementId: string,
  annotationId: string,
  input: TechDesignAnnotationStatusInput & WriteOptions
): Promise<TechDesignAnnotationList> {
  const { index } = await readIndex(workspaceRoot, requirementId);
  let found = false;
  const nextAnnotations = index.annotations.map((annotation) => {
    if (annotation.id !== annotationId) {
      return annotation;
    }
    found = true;
    const nextStatus = input.status == null ? annotation.status : input.status;
    if (!validStatus(nextStatus)) {
      throw new Error(`批注状态不合法: ${String(input.status)}`);
    }
    return {
      ...annotation,
      status: nextStatus,
      includeInNextGeneration:
        typeof input.includeInNextGeneration === 'boolean' ? input.includeInNextGeneration : annotation.includeInNextGeneration,
      updatedAt: new Date().toISOString()
    };
  });
  if (!found) {
    throw new Error(`批注不存在: ${annotationId}`);
  }
  await writeIndex(workspaceRoot, requirementId, { version: 1, annotations: nextAnnotations }, { expectedHash: input.expectedHash });
  return rebuildTechDesignAnnotationSummary(workspaceRoot, requirementId);
}

export async function deleteTechDesignAnnotation(
  workspaceRoot: string,
  requirementId: string,
  annotationId: string,
  input: WriteOptions = {}
): Promise<TechDesignAnnotationList> {
  const { index } = await readIndex(workspaceRoot, requirementId);
  const nextAnnotations = index.annotations.filter((annotation) => annotation.id !== annotationId);
  if (nextAnnotations.length === index.annotations.length) {
    throw new Error(`批注不存在: ${annotationId}`);
  }
  await writeIndex(workspaceRoot, requirementId, { version: 1, annotations: nextAnnotations }, { expectedHash: input.expectedHash });
  return rebuildTechDesignAnnotationSummary(workspaceRoot, requirementId);
}

export async function consumeTechDesignAnnotations(
  workspaceRoot: string,
  requirementId: string,
  runId: string
): Promise<TechDesignAnnotationList> {
  const { index } = await readIndex(workspaceRoot, requirementId);
  const now = new Date().toISOString();
  let changed = false;
  const nextAnnotations = index.annotations.map((annotation) => {
    if (!annotationIncludedInSummary(annotation)) {
      return annotation;
    }
    changed = true;
    return {
      ...annotation,
      consumedAt: now,
      consumedRunId: runId,
      updatedAt: now
    };
  });
  if (!changed) {
    return rebuildTechDesignAnnotationSummary(workspaceRoot, requirementId);
  }
  await writeIndex(workspaceRoot, requirementId, { version: 1, annotations: nextAnnotations });
  return rebuildTechDesignAnnotationSummary(workspaceRoot, requirementId);
}

export const internalForTests = {
  annotationsDir,
  readIndex,
  renderSummary,
  annotationIncludedInSummary
};
