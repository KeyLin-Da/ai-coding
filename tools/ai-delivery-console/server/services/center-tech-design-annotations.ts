import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  RequirementWorkflow,
  TechDesignAnnotation,
  TechDesignAnnotationAnchor,
  TechDesignAnnotationCreateInput,
  TechDesignAnnotationList,
  TechDesignAnnotationReply,
  TechDesignAnnotationReplyCreateInput,
  TechDesignAnnotationStatus,
  TechDesignAnnotationStatusInput,
  TechDesignVersionSource
} from '../../shared/workflow';
import type { LocalRequestContext } from './local-request-context';
import { centerPublicRequest, centerRequest, isCenterEndpointUnavailableError } from './center-client';
import { getRunRuntimeDir } from './runtime-paths';
import { assertInsideWorkspace, hashContent, normalizeRequirementId } from './workspace';
import { readTechDesignVersionContent } from './tech-design-versions';

interface CenterAnnotationPayload {
  id?: string | number;
  artifactPath?: string;
  versionId?: string;
  versionNo?: number;
  versionSource?: string;
  contentHash?: string;
  selectedText?: string;
  anchor?: Partial<TechDesignAnnotationAnchor>;
  comment?: string;
  status?: string;
  includeInNextGeneration?: boolean;
  consumedAt?: string | number[] | null;
  consumedRunId?: string;
  createdBy?: string | number;
  createdByName?: string;
  updatedBy?: string | number;
  updatedByName?: string;
  createdAt?: string | number[] | null;
  updatedAt?: string | number[] | null;
  replies?: CenterAnnotationReplyPayload[];
}

interface CenterAnnotationReplyPayload {
  id?: string | number;
  annotationId?: string | number;
  content?: string;
  consumedAt?: string | number[] | null;
  consumedRunId?: string;
  createdBy?: string | number;
  createdByName?: string;
  updatedBy?: string | number;
  updatedByName?: string;
  createdAt?: string | number[] | null;
  updatedAt?: string | number[] | null;
}

interface PreparedCenterAnnotationInput {
  sourceFilePath: string;
  annotations: TechDesignAnnotation[];
}

interface PublicAnnotationShareContext {
  requirementPk?: string | number;
  requirementId: string;
  artifactPath?: string;
}

const validStatuses = new Set<TechDesignAnnotationStatus>(['OPEN', 'RESOLVED', 'CARRIED_FORWARD', 'STALE']);
const validVersionSources = new Set<TechDesignVersionSource>(['PUBLISHED', 'DRAFT_SNAPSHOT', 'CURRENT_DRAFT']);

function normalizeText(value: unknown, maxLength = 2000): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeCenterDate(value: CenterAnnotationPayload['createdAt']): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day, hour = 0, minute = 0, second = 0, nano = 0] = value;
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second, Math.floor(nano / 1_000_000))).toISOString();
  }
  return undefined;
}

function normalizeStatus(value: unknown): TechDesignAnnotationStatus {
  const status = String(value || '').trim().toUpperCase() as TechDesignAnnotationStatus;
  return validStatuses.has(status) ? status : 'OPEN';
}

function normalizeVersionSource(value: unknown): TechDesignVersionSource {
  const source = String(value || '').trim().toUpperCase() as TechDesignVersionSource;
  return validVersionSources.has(source) ? source : 'PUBLISHED';
}

function normalizeAnchor(value?: Partial<TechDesignAnnotationAnchor>): TechDesignAnnotationAnchor {
  return {
    plainStart: Math.max(0, Number(value?.plainStart || 0)),
    plainEnd: Math.max(0, Number(value?.plainEnd || 0)),
    prefixText: normalizeText(value?.prefixText, 500),
    suffixText: normalizeText(value?.suffixText, 500),
    headingPath: Array.isArray(value?.headingPath) ? value.headingPath.map((item) => normalizeText(item, 100)).filter(Boolean) : [],
    occurrence: Math.max(1, Number(value?.occurrence || 1))
  };
}

function centerAnnotationPath(workflow: RequirementWorkflow, suffix = ''): string {
  if (!workflow.id) {
    throw new Error('缺少中心需求主键，无法读取技术方案批注');
  }
  return `/api/ai-delivery/requirements/${encodeURIComponent(String(workflow.id))}/tech-design-annotations${suffix}`;
}

function centerPublicAnnotationPath(token: string, suffix = ''): string {
  return `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}/tech-design-annotations${suffix}`;
}

export function centerTechDesignAnnotationsEnabled(context: LocalRequestContext, workflow: RequirementWorkflow): boolean {
  return Boolean(workflow.id && (context.accessToken || context.userId));
}

function toTechDesignAnnotation(requirementId: string, item: CenterAnnotationPayload): TechDesignAnnotation {
  const now = new Date().toISOString();
  const id = String(item.id || '');
  const consumedAt = normalizeCenterDate(item.consumedAt);
  return {
    id,
    requirementId: normalizeRequirementId(requirementId),
    artifactPath: String(item.artifactPath || ''),
    versionId: String(item.versionId || ''),
    versionNo: item.versionNo,
    versionSource: normalizeVersionSource(item.versionSource),
    contentHash: String(item.contentHash || ''),
    selectedText: String(item.selectedText || ''),
    anchor: normalizeAnchor(item.anchor),
    comment: String(item.comment || ''),
    status: consumedAt ? 'RESOLVED' : normalizeStatus(item.status),
    includeInNextGeneration: consumedAt ? false : item.includeInNextGeneration !== false,
    consumedAt,
    consumedRunId: item.consumedRunId,
    createdBy: item.createdBy,
    createdByName: normalizeText(item.createdByName, 100),
    updatedBy: item.updatedBy,
    updatedByName: normalizeText(item.updatedByName, 100),
    createdAt: normalizeCenterDate(item.createdAt) || now,
    updatedAt: normalizeCenterDate(item.updatedAt) || normalizeCenterDate(item.createdAt) || now,
    replies: Array.isArray(item.replies) ? item.replies.map((reply) => toTechDesignAnnotationReply(id, reply)) : []
  };
}

function toTechDesignAnnotationReply(annotationId: string, item: CenterAnnotationReplyPayload): TechDesignAnnotationReply {
  const now = new Date().toISOString();
  return {
    id: String(item.id || ''),
    annotationId: String(item.annotationId || annotationId),
    content: String(item.content || ''),
    consumedAt: normalizeCenterDate(item.consumedAt),
    consumedRunId: item.consumedRunId,
    createdBy: item.createdBy,
    createdByName: normalizeText(item.createdByName, 100),
    updatedBy: item.updatedBy,
    updatedByName: normalizeText(item.updatedByName, 100),
    createdAt: normalizeCenterDate(item.createdAt) || now,
    updatedAt: normalizeCenterDate(item.updatedAt) || normalizeCenterDate(item.createdAt) || now
  };
}

function toAnnotationListByRequirementId(requirementId: string, payload: CenterAnnotationPayload[]): TechDesignAnnotationList {
  const annotations = payload.map((item) => toTechDesignAnnotation(requirementId, item));
  return {
    annotations,
    hash: hashContent(JSON.stringify(annotations)),
    summaryPath: techDesignAnnotationSnapshotDirPath(requirementId)
  };
}

function toAnnotationList(workflow: RequirementWorkflow, payload: CenterAnnotationPayload[]): TechDesignAnnotationList {
  return toAnnotationListByRequirementId(workflow.requirementId, payload);
}

export function filterTechDesignAnnotationsByContentHash(
  list: TechDesignAnnotationList,
  contentHash?: string
): TechDesignAnnotationList {
  if (!contentHash) {
    return list;
  }
  const annotations = list.annotations.filter((annotation) => annotation.contentHash === contentHash);
  return {
    ...list,
    annotations,
    hash: hashContent(JSON.stringify(annotations))
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderAnnotationMarkdown(requirementId: string, annotations: TechDesignAnnotation[], title: string, description: string): string {
  const lines = [
    `# ${title}`,
    '',
    `需求编号: ${normalizeRequirementId(requirementId)}`,
    `生成时间: ${new Date().toISOString()}`,
    '',
    description,
    ''
  ];
  for (const [index, annotation] of annotations.entries()) {
    lines.push(`## ${index + 1}. ${annotation.status} / ${annotation.versionId || '-'}`);
    lines.push('');
    lines.push(`- 选中文案: ${escapeMarkdown(annotation.selectedText)}`);
    lines.push(`- 批注意见: ${escapeMarkdown(annotation.comment)}`);
    const replies = annotation.replies || [];
    if (replies.length) {
      lines.push(`- 回复:`);
      for (const reply of replies) {
        const actor = reply.createdByName || (reply.createdBy == null ? '未知用户' : `用户 ${reply.createdBy}`);
        lines.push(`  - ${escapeMarkdown(actor)} ${reply.createdAt || ''}: ${escapeMarkdown(reply.content)}`);
      }
    }
    lines.push(`- 原始版本: ${annotation.versionNo ? `v${annotation.versionNo}` : annotation.versionId || '-'}`);
    lines.push(`- 标题路径: ${annotation.anchor.headingPath.join(' > ') || '-'}`);
    lines.push(`- 批注 ID: ${annotation.id}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function safeRunFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'run';
}

export function techDesignAnnotationSnapshotDirPath(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/technical-design/annotation-snapshots`;
}

export function techDesignAnnotationSnapshotPath(requirementId: string, runId: string): string {
  return `${techDesignAnnotationSnapshotDirPath(requirementId)}/${safeRunFilePart(runId)}.md`;
}

export async function listCenterTechDesignAnnotations(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  versionId?: string
): Promise<TechDesignAnnotationList> {
  const suffix = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
  const payload = await centerRequest<CenterAnnotationPayload[]>(context, centerAnnotationPath(workflow, suffix));
  return toAnnotationList(workflow, payload);
}

export async function listPublicCenterTechDesignAnnotations(
  context: Pick<LocalRequestContext, 'centerBaseUrl'>,
  token: string,
  requirementId: string,
  versionId?: string
): Promise<TechDesignAnnotationList> {
  const suffix = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
  const payload = await centerPublicRequest<CenterAnnotationPayload[]>(context, centerPublicAnnotationPath(token, suffix));
  return toAnnotationListByRequirementId(requirementId, payload);
}

export async function createCenterTechDesignAnnotation(
  workspaceRoot: string,
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  input: TechDesignAnnotationCreateInput
): Promise<TechDesignAnnotationList> {
  const selectedText = normalizeText(input.selectedText, 2000);
  const comment = normalizeText(input.comment, 4000);
  if (!selectedText) {
    throw new Error('请选择需要批注的文案');
  }
  if (!comment) {
    throw new Error('请输入批注内容');
  }
  const versionContent = await readTechDesignVersionContent(workspaceRoot, workflow.requirementId, input.versionId);
  const payload = await centerRequest<CenterAnnotationPayload[]>(context, centerAnnotationPath(workflow), {
    method: 'POST',
    body: JSON.stringify({
      artifactPath: versionContent.version.artifactPath,
      versionId: versionContent.version.id,
      versionNo: versionContent.version.versionNo,
      versionSource: versionContent.version.source,
      contentHash: versionContent.version.contentHash || hashContent(versionContent.content),
      selectedText,
      comment,
      includeInNextGeneration: input.includeInNextGeneration !== false,
      anchor: normalizeAnchor(input.anchor)
    })
  });
  return toAnnotationList(workflow, payload);
}

export async function createPublicCenterTechDesignAnnotation(
  workspaceRoot: string,
  context: LocalRequestContext,
  token: string,
  share: PublicAnnotationShareContext,
  input: TechDesignAnnotationCreateInput
): Promise<TechDesignAnnotationList> {
  const selectedText = normalizeText(input.selectedText, 2000);
  const comment = normalizeText(input.comment, 4000);
  if (!selectedText) {
    throw new Error('请选择需要批注的文案');
  }
  if (!comment) {
    throw new Error('请输入批注内容');
  }
  const versionContent = await readTechDesignVersionContent(workspaceRoot, share.requirementId, input.versionId);
  const payload = await centerRequest<CenterAnnotationPayload[]>(context, centerPublicAnnotationPath(token), {
    method: 'POST',
    body: JSON.stringify({
      artifactPath: versionContent.version.artifactPath,
      versionId: versionContent.version.id,
      versionNo: versionContent.version.versionNo,
      versionSource: versionContent.version.source,
      contentHash: versionContent.version.contentHash || hashContent(versionContent.content),
      selectedText,
      comment,
      includeInNextGeneration: input.includeInNextGeneration !== false,
      anchor: normalizeAnchor(input.anchor)
    })
  });
  return toAnnotationListByRequirementId(share.requirementId, payload);
}

export async function deletePublicCenterTechDesignAnnotation(
  context: LocalRequestContext,
  token: string,
  requirementId: string,
  annotationId: string
): Promise<TechDesignAnnotationList> {
  const payload = await centerRequest<CenterAnnotationPayload[]>(
    context,
    centerPublicAnnotationPath(token, `/${encodeURIComponent(annotationId)}/delete`),
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
  return toAnnotationListByRequirementId(requirementId, payload);
}

export async function createPublicCenterTechDesignAnnotationReply(
  context: LocalRequestContext,
  token: string,
  requirementId: string,
  annotationId: string,
  input: TechDesignAnnotationReplyCreateInput
): Promise<TechDesignAnnotationList> {
  const content = normalizeText(input.content, 4000);
  if (!content) {
    throw new Error('请输入回复内容');
  }
  const payload = await centerRequest<CenterAnnotationPayload[]>(
    context,
    centerPublicAnnotationPath(token, `/${encodeURIComponent(annotationId)}/replies`),
    {
      method: 'POST',
      body: JSON.stringify({ content })
    }
  );
  return toAnnotationListByRequirementId(requirementId, payload);
}

export async function deletePublicCenterTechDesignAnnotationReply(
  context: LocalRequestContext,
  token: string,
  requirementId: string,
  annotationId: string,
  replyId: string
): Promise<TechDesignAnnotationList> {
  const payload = await centerRequest<CenterAnnotationPayload[]>(
    context,
    centerPublicAnnotationPath(token, `/${encodeURIComponent(annotationId)}/replies/${encodeURIComponent(replyId)}/delete`),
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
  return toAnnotationListByRequirementId(requirementId, payload);
}

export async function updateCenterTechDesignAnnotationStatus(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  annotationId: string,
  input: TechDesignAnnotationStatusInput
): Promise<TechDesignAnnotationList> {
  const payload = await centerRequest<CenterAnnotationPayload[]>(
    context,
    centerAnnotationPath(workflow, `/${encodeURIComponent(annotationId)}/status`),
    {
      method: 'POST',
      body: JSON.stringify({
        status: input.status,
        includeInNextGeneration: input.includeInNextGeneration
      })
    }
  );
  return toAnnotationList(workflow, payload);
}

export async function createCenterTechDesignAnnotationReply(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  annotationId: string,
  input: TechDesignAnnotationReplyCreateInput
): Promise<TechDesignAnnotationList> {
  const content = normalizeText(input.content, 4000);
  if (!content) {
    throw new Error('请输入回复内容');
  }
  const payload = await centerRequest<CenterAnnotationPayload[]>(
    context,
    centerAnnotationPath(workflow, `/${encodeURIComponent(annotationId)}/replies`),
    {
      method: 'POST',
      body: JSON.stringify({ content })
    }
  );
  return toAnnotationList(workflow, payload);
}

export async function deleteCenterTechDesignAnnotationReply(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  annotationId: string,
  replyId: string
): Promise<TechDesignAnnotationList> {
  const payload = await centerRequest<CenterAnnotationPayload[]>(
    context,
    centerAnnotationPath(workflow, `/${encodeURIComponent(annotationId)}/replies/${encodeURIComponent(replyId)}/delete`),
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
  return toAnnotationList(workflow, payload);
}

export async function deleteCenterTechDesignAnnotation(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  annotationId: string
): Promise<TechDesignAnnotationList> {
  const payload = await centerRequest<CenterAnnotationPayload[]>(
    context,
    centerAnnotationPath(workflow, `/${encodeURIComponent(annotationId)}/delete`),
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
  return toAnnotationList(workflow, payload);
}

export async function listConsumableCenterTechDesignAnnotations(
  context: LocalRequestContext,
  workflow: RequirementWorkflow
): Promise<TechDesignAnnotation[]> {
  let payload: CenterAnnotationPayload[];
  try {
    payload = await centerRequest<CenterAnnotationPayload[]>(context, centerAnnotationPath(workflow, '/pending'));
  } catch (error) {
    if (isCenterEndpointUnavailableError(error)) {
      return [];
    }
    throw error;
  }
  return payload.map((item) => toTechDesignAnnotation(workflow.requirementId, item));
}

export async function prepareCenterTechDesignAnnotationInput(
  workspaceRoot: string,
  context: LocalRequestContext,
  workflow: RequirementWorkflow
): Promise<PreparedCenterAnnotationInput | undefined> {
  if (!centerTechDesignAnnotationsEnabled(context, workflow)) {
    return undefined;
  }
  const annotations = await listConsumableCenterTechDesignAnnotations(context, workflow);
  if (!annotations.length) {
    return undefined;
  }
  const runtimeDir = getRunRuntimeDir(workspaceRoot, workflow.requirementId);
  await fs.mkdir(runtimeDir, { recursive: true });
  const sourceFilePath = path.join(runtimeDir, `tech-design-annotations-${Date.now()}.md`);
  await fs.writeFile(
    sourceFilePath,
    renderAnnotationMarkdown(
      workflow.requirementId,
      annotations,
      '技术方案批注摘要',
      '以下中心批注将作为下一次技术方案生成的补充输入。'
    ),
    'utf8'
  );
  return { sourceFilePath, annotations };
}

export async function consumeCenterTechDesignAnnotationsAndSnapshot(
  workspaceRoot: string,
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  runId: string,
  annotationIds?: string[]
): Promise<TechDesignAnnotation[]> {
  if (!centerTechDesignAnnotationsEnabled(context, workflow)) {
    return [];
  }
  let payload: CenterAnnotationPayload[];
  try {
    payload = await centerRequest<CenterAnnotationPayload[]>(context, centerAnnotationPath(workflow, '/consume'), {
      method: 'POST',
      body: JSON.stringify({
        runId,
        ...(annotationIds === undefined ? {} : { annotationIds })
      })
    });
  } catch (error) {
    if (isCenterEndpointUnavailableError(error)) {
      return [];
    }
    throw error;
  }
  const annotations = payload.map((item) => toTechDesignAnnotation(workflow.requirementId, item));
  if (!annotations.length) {
    return [];
  }
  const snapshotPath = techDesignAnnotationSnapshotPath(workflow.requirementId, runId);
  const absoluteSnapshotPath = assertInsideWorkspace(workspaceRoot, snapshotPath);
  await fs.mkdir(path.dirname(absoluteSnapshotPath), { recursive: true });
  await fs.writeFile(
    absoluteSnapshotPath,
    renderAnnotationMarkdown(
      workflow.requirementId,
      annotations,
      '技术方案批注消费快照',
      `本快照记录运行 ${runId} 已消费的中心批注。`
    ),
    'utf8'
  );
  return annotations;
}
