import fs from 'node:fs/promises';
import path from 'node:path';
import type { ActionInput, RequirementWorkflow, SupplementBlock, SupplementFileBlock, SupplementFileContextRole } from '../../shared/workflow';
import { stageForAction } from '../../shared/workflow';
import { assertInsideWorkspace, normalizeRequirementId } from './workspace';

type SupplementTextParam = 'description' | 'clarification' | 'artifactAdjustment';

interface SnapshotActionConfig {
  textParam: SupplementTextParam;
}

interface PrepareSupplementSnapshotOptions {
  runId: string;
  capturedAt?: string;
}

const snapshotActionConfigs: Partial<Record<ActionInput['actionType'], SnapshotActionConfig>> = {
  PRD_ANALYZE: { textParam: 'description' },
  PRD_CLARIFY: { textParam: 'description' },
  DESIGN_GENERATE: { textParam: 'clarification' },
  OPENSPEC_FF: { textParam: 'artifactAdjustment' }
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function inferContextRole(block: Record<string, unknown>): SupplementFileContextRole {
  if (block.contextRole === 'INLINE' || block.contextRole === 'ATTACHMENT') {
    return block.contextRole;
  }
  return /^pasted-/i.test(asString(block.name)) ? 'INLINE' : 'ATTACHMENT';
}

function normalizeSupplementBlocks(value: unknown): SupplementBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const blocks: SupplementBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const block = item as Record<string, unknown>;
    const id = asString(block.id);
    if (!id) {
      continue;
    }
    if (block.type === 'PARAGRAPH') {
      const text = asString(block.text);
      if (text) {
        blocks.push({ id, type: 'PARAGRAPH', text });
      }
      continue;
    }
    if (block.type === 'IMAGE' || block.type === 'FILE') {
      const fileBlock: SupplementFileBlock = {
        id,
        type: block.type,
        fileId: asString(block.fileId) || id,
        name: asString(block.name),
        path: asString(block.path),
        size: Number(block.size || 0),
        mimeType: typeof block.mimeType === 'string' ? block.mimeType : undefined,
        uploadedAt: typeof block.uploadedAt === 'string' ? block.uploadedAt : undefined,
        caption: asString(block.caption) || undefined,
        status: block.status === 'UPLOADING' || block.status === 'FAILED' ? block.status : 'READY',
        error: asString(block.error) || undefined,
        contextRole: inferContextRole(block)
      };
      if (fileBlock.path || fileBlock.name || fileBlock.caption) {
        blocks.push(fileBlock);
      }
    }
  }
  return blocks;
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\]/g, '\\]');
}

function renderSupplementBlock(block: SupplementBlock): string {
  if (block.type === 'PARAGRAPH') {
    return block.text.trim();
  }
  if (block.status === 'UPLOADING') {
    return `[${block.type === 'IMAGE' ? '图片' : '文件'}上传中: ${block.name || block.fileId}]`;
  }
  if (block.status === 'FAILED') {
    return `[${block.type === 'IMAGE' ? '图片' : '文件'}上传失败: ${block.name || block.fileId}${block.error ? `，${block.error}` : ''}]`;
  }
  if (block.type === 'IMAGE') {
    const alt = escapeMarkdownLabel(block.caption || block.name || '补充图片');
    return block.path ? `![${alt}](${block.path})` : `[补充图片: ${alt}]`;
  }
  const label = escapeMarkdownLabel(block.name || block.caption || '补充文件');
  const fileLink = block.path ? `[补充文件: ${label}](${block.path})` : `[补充文件: ${label}]`;
  return block.caption ? `${fileLink}\n${block.caption.trim()}` : fileLink;
}

function renderSupplementMarkdown(blocks: SupplementBlock[], fallbackText: string): string {
  const blockMarkdown = blocks.map(renderSupplementBlock).filter(Boolean).join('\n\n').trim();
  return blockMarkdown || fallbackText.trim();
}

function extractSupplementFiles(blocks: SupplementBlock[]): SupplementFileBlock[] {
  return blocks.filter(
    (block): block is SupplementFileBlock => (block.type === 'IMAGE' || block.type === 'FILE') && block.status !== 'UPLOADING' && block.status !== 'FAILED' && Boolean(block.path)
  );
}

function compactTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  }
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

function snapshotDirectory(requirementId: string, actionType: ActionInput['actionType']): string {
  const id = normalizeRequirementId(requirementId);
  if (actionType === 'PRD_ANALYZE' || actionType === 'PRD_CLARIFY') {
    return `docs/${id}/prd/inputs/supplements`;
  }
  if (actionType === 'DESIGN_GENERATE') {
    return `docs/${id}/technical-design/inputs/supplements`;
  }
  if (actionType === 'OPENSPEC_FF') {
    return `docs/${id}/implementation/artifact-review/inputs/supplements`;
  }
  return `docs/${id}/workflow/supplements`;
}

function snapshotPath(requirementId: string, actionType: ActionInput['actionType'], runId: string, capturedAt: string): string {
  const timestamp = compactTimestamp(capturedAt);
  return `${snapshotDirectory(requirementId, actionType)}/${timestamp}-${actionType.toLowerCase()}-${safeSegment(runId)}.md`;
}

function renderSnapshotMarkdown(input: {
  workflow: RequirementWorkflow;
  action: ActionInput;
  runId: string;
  capturedAt: string;
  supplementMarkdown: string;
  files: SupplementFileBlock[];
}): string {
  const stage = stageForAction(input.action.actionType) || '-';
  const fileLines = input.files.length
    ? input.files.map((file) => {
        const label = file.type === 'IMAGE' ? '图片' : '文件';
        const caption = file.caption ? `；说明: ${file.caption}` : '';
        const size = file.size ? `；大小: ${file.size} B` : '';
        const role = file.contextRole === 'INLINE' ? '正文内联' : '独立附件';
        return `- ${label}: ${file.name || file.fileId}；路径: ${file.path}；类型: ${role}${size}${caption}`;
      })
    : ['- 无'];
  return [
    '# 补充输入快照',
    '',
    `- 需求号: ${input.workflow.requirementId}`,
    `- 标题: ${input.workflow.title || '-'}`,
    `- 阶段: ${stage}`,
    `- 动作: ${input.action.actionType}`,
    `- 运行 ID: ${input.runId}`,
    `- 创建时间: ${input.capturedAt}`,
    '',
    '## 补充说明',
    '',
    input.supplementMarkdown || '无',
    '',
    '## 附件清单',
    '',
    ...fileLines,
    ''
  ].join('\n');
}

export async function prepareSupplementInputSnapshotAction(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  action: ActionInput,
  options: PrepareSupplementSnapshotOptions
): Promise<{ action: ActionInput; snapshotPath?: string }> {
  const config = snapshotActionConfigs[action.actionType];
  if (!config) {
    return { action };
  }

  const params = action.params || {};
  const rawText = asString(params[config.textParam]);
  const blocks = normalizeSupplementBlocks(params.supplementBlocks);
  const supplementMarkdown = renderSupplementMarkdown(blocks, rawText);
  const files = extractSupplementFiles(blocks);
  if (!supplementMarkdown && files.length === 0) {
    return { action };
  }

  const capturedAt = options.capturedAt || new Date().toISOString();
  const relativePath = snapshotPath(workflow.requirementId, action.actionType, options.runId, capturedAt);
  const absolutePath = assertInsideWorkspace(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(
    absolutePath,
    renderSnapshotMarkdown({
      workflow,
      action,
      runId: options.runId,
      capturedAt,
      supplementMarkdown,
      files
    }),
    'utf8'
  );

  const nextParams = {
    ...params,
    [config.textParam]: `补充输入见 ${relativePath}`,
    supplementInputPath: relativePath
  };

  return {
    action: {
      ...action,
      params: nextParams
    },
    snapshotPath: relativePath
  };
}

export const internalForTests = {
  renderSupplementMarkdown,
  renderSnapshotMarkdown,
  snapshotDirectory,
  snapshotPath
};
