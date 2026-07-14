import fs from 'node:fs/promises';
import path from 'node:path';
import type { ActionInput, OpenSpecArtifactInputSnapshot, RequirementWorkflow, TechDesignVersion } from '../../shared/workflow';
import { assertInsideWorkspace, hashContent, normalizeRequirementId } from './workspace';
import {
  createTechDesignDraftSnapshot,
  diffTechDesignVersions,
  listTechDesignVersions,
  readTechDesignVersionContent
} from './tech-design-versions';

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isOpenSpecFastForward(action: ActionInput): boolean {
  return action.actionType === 'OPENSPEC_FF';
}

function hasVersionContextParams(params: Record<string, unknown>): boolean {
  return Boolean(
    asString(params.baseTechDesignVersionId) ||
      asString(params.targetTechDesignVersionId) ||
      asString(params.artifactAdjustment)
  );
}

function latestOpenSpecTargetVersion(workflow: RequirementWorkflow): string {
  return (
    [...workflow.runs]
      .filter((run) => run.actionType === 'OPENSPEC_FF' && !['FAILED', 'CANCELLED'].includes(run.status))
      .sort((left, right) => Date.parse(right.finishedAt || right.startedAt) - Date.parse(left.finishedAt || left.startedAt))
      .map((run) => run.openSpecArtifactInputSnapshot?.targetTechDesignVersionId || '')
      .find(Boolean) || ''
  );
}

function fallbackBaseVersion(versions: TechDesignVersion[], targetVersionId: string): string {
  const readable = versions.filter((version) => version.readable);
  return (
    readable.find((version) => version.source === 'DRAFT_SNAPSHOT' && version.id !== targetVersionId)?.id ||
    readable.find((version) => version.source === 'PUBLISHED' && version.id !== targetVersionId)?.id ||
    readable.find((version) => version.id !== targetVersionId)?.id ||
    ''
  );
}

async function resolveTargetVersionId(workspaceRoot: string, requirementId: string, targetVersionId: string): Promise<string> {
  if (targetVersionId !== 'current') {
    return targetVersionId;
  }
  const snapshot = await createTechDesignDraftSnapshot(workspaceRoot, requirementId);
  if (!snapshot?.id) {
    throw new Error('当前技术方案草稿不可读取，无法冻结目标版本');
  }
  return snapshot.id;
}

function metadataLine(label: string, version: TechDesignVersion): string {
  return [
    `- ${label}版本: ${version.label}`,
    `ID=${version.id}`,
    `source=${version.source}`,
    version.contentHash ? `hash=${version.contentHash}` : '',
    version.commitSha ? `commit=${version.commitSha}` : ''
  ]
    .filter(Boolean)
    .join('；');
}

function renderContextMarkdown(input: {
  requirementId: string;
  changeName: string;
  base: TechDesignVersion;
  target: TechDesignVersion;
  diff: string;
  truncated: boolean;
  adjustment: string;
  capturedAt: string;
}): string {
  return [
    '# OpenSpec 工件生成技术方案版本上下文',
    '',
    `- 需求号: ${input.requirementId}`,
    `- OpenSpec 变更: ${input.changeName || '-'}`,
    `- 捕获时间: ${input.capturedAt}`,
    metadataLine('基线', input.base),
    metadataLine('目标', input.target),
    '',
    '## 工件调整说明',
    '',
    input.adjustment || '无',
    '',
    '## 技术方案版本差异',
    '',
    input.truncated ? '> diff 内容过长，已截断。' : '',
    '',
    '```diff',
    input.diff || '# 两个技术方案版本正文无差异',
    '```',
    ''
  ].join('\n');
}

function contextPath(requirementId: string, content: string): string {
  const id = normalizeRequirementId(requirementId);
  const fingerprint = hashContent(content).slice(0, 16);
  return `docs/${id}/implementation/artifact-review/inputs/${fingerprint}-tech-design-version-context.md`;
}

export async function prepareOpenSpecArtifactAction(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  action: ActionInput
): Promise<ActionInput> {
  if (!isOpenSpecFastForward(action)) {
    return action;
  }
  const params = action.params || {};
  if (!hasVersionContextParams(params)) {
    return action;
  }

  const requirementId = normalizeRequirementId(workflow.requirementId);
  const changeName = asString(params.changeName, workflow.stages.IMPLEMENTATION.changeName || `req-${requirementId}`);
  const requestedTarget = asString(params.targetTechDesignVersionId, 'current');
  const targetVersionId = await resolveTargetVersionId(workspaceRoot, requirementId, requestedTarget);
  const versions = await listTechDesignVersions(workspaceRoot, requirementId);
  const baseVersionId = asString(params.baseTechDesignVersionId, latestOpenSpecTargetVersion(workflow)) || fallbackBaseVersion(versions, targetVersionId);
  const adjustment = asString(params.artifactAdjustment);
  if (!baseVersionId) {
    throw new Error('缺少可用的技术方案基线版本');
  }
  if (baseVersionId === targetVersionId && !adjustment) {
    throw new Error('技术方案基线版本和目标版本一致，请填写工件调整说明或选择不同版本');
  }

  const [baseContent, targetContent, diffResult] = await Promise.all([
    readTechDesignVersionContent(workspaceRoot, requirementId, baseVersionId),
    readTechDesignVersionContent(workspaceRoot, requirementId, targetVersionId),
    diffTechDesignVersions(workspaceRoot, requirementId, {
      leftVersionId: baseVersionId,
      rightVersionId: targetVersionId
    })
  ]);
  if (baseContent.version.contentHash === targetContent.version.contentHash && !adjustment) {
    throw new Error('技术方案基线和目标内容一致，请填写工件调整说明或选择不同版本');
  }
  const capturedAt = new Date().toISOString();
  const content = renderContextMarkdown({
    requirementId,
    changeName,
    base: baseContent.version,
    target: targetContent.version,
    diff: diffResult.diff,
    truncated: diffResult.truncated,
    adjustment,
    capturedAt
  });
  const relativePath = contextPath(
    requirementId,
    JSON.stringify({
      baseVersionId: baseContent.version.id,
      baseContentHash: baseContent.version.contentHash,
      targetVersionId: targetContent.version.id,
      targetContentHash: targetContent.version.contentHash,
      adjustment,
      diffHash: hashContent(diffResult.diff || '')
    })
  );
  const absolutePath = assertInsideWorkspace(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');

  const snapshot: OpenSpecArtifactInputSnapshot = {
    baseTechDesignVersionId: baseContent.version.id,
    baseTechDesignVersionLabel: baseContent.version.label,
    baseContentHash: baseContent.version.contentHash,
    targetTechDesignVersionId: targetContent.version.id,
    targetTechDesignVersionLabel: targetContent.version.label,
    targetContentHash: targetContent.version.contentHash,
    contextPath: relativePath,
    adjustment: adjustment || undefined,
    capturedAt
  };

  return {
    ...action,
    params: {
      ...params,
      baseTechDesignVersionId: snapshot.baseTechDesignVersionId,
      targetTechDesignVersionId: snapshot.targetTechDesignVersionId,
      openSpecArtifactContextPath: relativePath
    },
    openSpecArtifactInputSnapshot: snapshot
  };
}

export const internalForTests = {
  contextPath,
  renderContextMarkdown
};
