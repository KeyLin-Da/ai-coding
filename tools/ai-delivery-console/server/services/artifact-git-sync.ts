import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequirementWorkflow, WorkflowStage } from '../../shared/workflow';
import type { LocalRequestContext } from './local-request-context';
import { centerRequest } from './center-client';
import { hashContent } from './workspace';
import { inspectProjectRepository, resolveProjectRepoPath, runGit } from './project-repository';
import { privateKeyPathForCredential, requireActiveGitCredential } from './local-git-credentials';
import { isReportRunLogPath } from './artifact-path-rules';

export interface ArtifactGitSyncPlanInput {
  stage: WorkflowStage;
  syncType?: 'REVIEW_APPROVAL' | 'PUBLIC_SYNC' | 'SKILL_SYNC' | 'BOOTSTRAP';
}

export interface ArtifactGitSyncConfirmInput extends ArtifactGitSyncPlanInput {
  files: string[];
  message?: string;
  review?: {
    decision: string;
    comment?: string;
    implementationStep?: string;
  };
  requirementPk?: string | number;
}

export interface ArtifactGitSyncPlanFile {
  path: string;
  status: string;
  selected: boolean;
  contentSha256?: string;
}

export interface ArtifactGitSyncPlan {
  requirementId: string;
  stage: WorkflowStage;
  syncType: string;
  blocked: boolean;
  blockers: string[];
  repoPath: string;
  headCommit?: string;
  remoteCommit?: string;
  files: ArtifactGitSyncPlanFile[];
  diff: string;
}

export interface ArtifactGitSyncConfirmResult {
  commitSha?: string;
  pushed: boolean;
  centerResult: unknown;
}

function parsePorcelainStatus(output: string): Array<{ status: string; path: string; indexStatus: string; worktreeStatus: string }> {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawStatus = line.slice(0, 2);
      const status = rawStatus.trim() || rawStatus;
      const rawPath = line.slice(3);
      const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() || rawPath : rawPath;
      return { status, indexStatus: rawStatus[0] || ' ', worktreeStatus: rawStatus[1] || ' ', path: filePath.replace(/\\/g, '/') };
    });
}

function controlledPrefixes(workflow: RequirementWorkflow): string[] {
  const requirementId = workflow.requirementId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const changeName = workflow.stages.IMPLEMENTATION.changeName || `req-${requirementId}`;
  return [
    `docs/${requirementId}/`,
    'docs/code_review/',
    `openspec/changes/${changeName}/`,
    'openspec/specs/',
    '.codex/commands/',
    '.codex/skills/',
    '.codebuddy/commands/',
    '.codebuddy/skills/',
    '.qoder/commands/',
    '.qoder/skills/',
    '.qwen/commands/',
    '.qwen/skills/'
  ];
}

function excludedPrefixes(workflow: RequirementWorkflow): string[] {
  const requirementId = workflow.requirementId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return [`docs/${requirementId}/workflow/`];
}

function isExcludedArtifactPath(workflow: RequirementWorkflow, normalizedPath: string): boolean {
  return excludedPrefixes(workflow).some((prefix) => normalizedPath.startsWith(prefix)) || isReportRunLogPath(normalizedPath, workflow.requirementId);
}

function controlledExactPaths(): string[] {
  return [
    'openspec/config.yaml'
  ];
}

export function assertControlledArtifactPath(workflow: RequirementWorkflow, filePath: string): string {
  const normalized = String(filePath || '').trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('../') || normalized.includes('//')) {
    throw new Error(`同步文件路径不合法: ${filePath}`);
  }
  const isExcluded = isExcludedArtifactPath(workflow, normalized);
  const isControlled = !isExcluded && (controlledExactPaths().includes(normalized) || controlledPrefixes(workflow).some((prefix) => normalized.startsWith(prefix)));
  if (!isControlled) {
    throw new Error(`同步文件不在受控产物路径内: ${filePath}`);
  }
  return normalized;
}

function syncType(input?: ArtifactGitSyncPlanInput): string {
  return input?.syncType || 'PUBLIC_SYNC';
}

async function reportBlockedSync(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  input: ArtifactGitSyncPlanInput,
  blockers: string[]
): Promise<void> {
  const requirementPk = workflow.id;
  if (!requirementPk || !blockers.length) {
    return;
  }
  await centerRequest(context, `/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk))}/artifact-git-syncs/blocked`, {
    method: 'POST',
    body: JSON.stringify({
      stage: input.stage,
      syncType: syncType(input),
      errorMessage: blockers.join('；')
    })
  }).catch(() => undefined);
}

async function fileHash(repoPath: string, filePath: string): Promise<string | undefined> {
  const absolute = path.join(repoPath, filePath);
  const content = await fs.readFile(absolute).catch(() => undefined);
  return content ? hashContent(content) : undefined;
}

function isLikelyBinary(content: Buffer): boolean {
  return content.includes(0);
}

function untrackedTextDiff(filePath: string, content: Buffer): string {
  if (isLikelyBinary(content)) {
    return [
      `diff --git a/${filePath} b/${filePath}`,
      'new file mode 100644',
      'index 0000000..0000000',
      `Binary files /dev/null and b/${filePath} differ`
    ].join('\n');
  }
  const text = content.toString('utf8').replace(/\r\n/g, '\n');
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const addedLines = text.length ? lines : [];
  return [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    'index 0000000..0000000',
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${addedLines.length} @@`,
    ...addedLines.map((line) => `+${line}`)
  ].join('\n');
}

async function selectedDiff(repoPath: string, files: Array<{ path: string; status: string }>): Promise<string> {
  if (!files.length) {
    return '';
  }
  const trackedFiles = files.filter((file) => file.status !== '??').map((file) => file.path);
  const untrackedFiles = files.filter((file) => file.status === '??').map((file) => file.path);
  const [staged, unstaged] = await Promise.all([
    trackedFiles.length ? runGit(repoPath, ['diff', '--cached', '--no-ext-diff', '--', ...trackedFiles]).catch(() => '') : '',
    trackedFiles.length ? runGit(repoPath, ['diff', '--no-ext-diff', '--', ...trackedFiles]).catch(() => '') : ''
  ]);
  const untracked = await Promise.all(
    untrackedFiles.map(async (filePath) => {
      const content = await fs.readFile(path.join(repoPath, filePath)).catch(() => undefined);
      return content ? untrackedTextDiff(filePath, content) : '';
    })
  );
  return [staged, unstaged, ...untracked].filter(Boolean).join('\n');
}

async function controlledChangedFiles(
  repoPath: string,
  workflow: RequirementWorkflow
): Promise<Array<{ path: string; status: string; indexStatus: string; worktreeStatus: string }>> {
  const status = await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all']).catch(() => '');
  return parsePorcelainStatus(status)
    .filter((item) => {
      try {
        assertControlledArtifactPath(workflow, item.path);
        return true;
      } catch {
        return false;
      }
    });
}

export async function buildArtifactGitSyncPlan(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  input: ArtifactGitSyncPlanInput
): Promise<ArtifactGitSyncPlan> {
  const repoState = await inspectProjectRepository(context);
  const { repoPath } = await resolveProjectRepoPath(context);
  const blockers: string[] = [];
  if (repoState.syncStatus === 'NOT_CLONED') {
    blockers.push('项目产物仓尚未 clone');
  }
  if (repoState.syncStatus === 'BEHIND_REMOTE') {
    blockers.push('本地项目产物仓落后远端，请先拉取最新提交');
  }
  if (repoState.syncStatus === 'CONFLICTING' || repoState.syncStatus === 'FAILED') {
    blockers.push('项目产物仓状态异常，请先处理后重试');
  }

  const changed = await controlledChangedFiles(repoPath, workflow);
  const files = await Promise.all(
    changed.map(async (item) => ({
      path: item.path,
      status: item.status,
      selected: true,
      contentSha256: await fileHash(repoPath, item.path)
    }))
  );
  if (blockers.length) {
    await reportBlockedSync(context, workflow, input, blockers);
  }
  return {
    requirementId: workflow.requirementId,
    stage: input.stage,
    syncType: syncType(input),
    blocked: blockers.length > 0,
    blockers,
    repoPath,
    headCommit: repoState.headCommit,
    remoteCommit: repoState.remoteCommit,
    files,
    diff: await selectedDiff(repoPath, files)
  };
}

async function gitFileMetadata(repoPath: string, filePath: string): Promise<{ path: string; blobSha: string; contentSha256: string }> {
  const treeLine = (await runGit(repoPath, ['ls-tree', 'HEAD', '--', filePath])).trim();
  const match = treeLine.match(/^(\d+)\s+\w+\s+([a-fA-F0-9]+)\t(.+)$/);
  const content = await fs.readFile(path.join(repoPath, filePath)).catch(() => Buffer.from(''));
  return {
    path: filePath,
    blobSha: match ? `${match[1]}:${match[2]}` : hashContent(content),
    contentSha256: hashContent(content)
  };
}

function requirementPk(workflow: RequirementWorkflow, input: ArtifactGitSyncConfirmInput): string | number {
  const value = input.requirementPk || workflow.id;
  if (!value) {
    throw new Error('缺少中心需求主键，无法回写Git产物索引');
  }
  return value;
}

function defaultCommitMessage(workflow: RequirementWorkflow, input: ArtifactGitSyncConfirmInput): string {
  return input.message || `ai-delivery(${workflow.requirementId}): sync ${input.stage}`;
}

async function assertRemoteNotAdvanced(repoPath: string, branch: string, gitOptions: { privateKeyPath?: string }): Promise<void> {
  await runGit(repoPath, ['fetch', 'origin', branch], gitOptions);
  const counts = (await runGit(repoPath, ['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`], gitOptions)).trim();
  const [, behindRaw] = counts.split(/\s+/);
  const behind = Number(behindRaw || 0);
  if (behind > 0) {
    throw new Error('远端已有新提交，请先拉取最新产物仓后重试');
  }
}

export async function confirmArtifactGitSync(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  input: ArtifactGitSyncConfirmInput
): Promise<ArtifactGitSyncConfirmResult> {
  const files = [...new Set((input.files || []).map((file) => assertControlledArtifactPath(workflow, file)))];
  const inputSyncType = syncType(input);
  if (inputSyncType === 'REVIEW_APPROVAL' && input.review?.implementationStep) {
    throw new Error('顶层审核同步不能携带实施验证子步骤，请使用普通审核提交子步骤结论');
  }
  const isEmptyReviewApproval = !files.length && inputSyncType === 'REVIEW_APPROVAL' && Boolean(input.review);
  if (!files.length && !isEmptyReviewApproval) {
    throw new Error('请至少选择一个需要同步的产物文件');
  }
  const repoState = await inspectProjectRepository(context);
  if (repoState.syncStatus === 'NOT_CLONED') {
    throw new Error('项目产物仓尚未 clone，请先进入项目完成仓库初始化');
  }
  if (repoState.syncStatus === 'BEHIND_REMOTE') {
    throw new Error('本地项目产物仓落后远端，请先拉取最新提交');
  }
  if (repoState.syncStatus === 'CONFLICTING' || repoState.syncStatus === 'FAILED') {
    throw new Error('项目产物仓状态异常，请先处理后重试');
  }
  const { project, repoPath } = await resolveProjectRepoPath(context);
  const credential = await requireActiveGitCredential(context, project.repository?.provider || 'PROJECT_GIT');
  const privateKeyPath = await privateKeyPathForCredential(context, credential);
  const gitOptions = { privateKeyPath };

  if (isEmptyReviewApproval) {
    await assertRemoteNotAdvanced(repoPath, project.repository?.defaultBranch || 'master', gitOptions);
    const changed = await controlledChangedFiles(repoPath, workflow);
    if (changed.length) {
      throw new Error('当前仍有待同步产物文件，请刷新同步计划后选择文件再提交审核');
    }
    const centerResult = await centerRequest(context, '/api/ai-delivery/reviews', {
      method: 'POST',
      body: JSON.stringify({
        requirementPk: requirementPk(workflow, input),
        requirementId: workflow.requirementId,
        stage: input.stage,
        decision: input.review?.decision,
        comment: input.review?.comment || ''
      })
    });
    return {
      pushed: false,
      centerResult
    };
  }

  const currentChanged = await controlledChangedFiles(repoPath, workflow);
  const currentChangedByPath = new Map(currentChanged.map((file) => [file.path, file]));
  const currentChangedPathSet = new Set(currentChangedByPath.keys());
  const staleFiles = files.filter((file) => !currentChangedPathSet.has(file));
  if (staleFiles.length) {
    throw new Error(`同步计划已过期，请返回上一步重新生成同步计划后重试：${staleFiles.join('、')}`);
  }

  const filesToAdd = files.filter((file) => {
    const changed = currentChangedByPath.get(file);
    return !(changed?.indexStatus === 'D' && changed.worktreeStatus === ' ');
  });
  if (filesToAdd.length) {
    await runGit(repoPath, ['add', '--', ...filesToAdd], gitOptions);
  }
  const diffCheck = await runGit(repoPath, ['diff', '--cached', '--quiet', '--', ...files], gitOptions)
    .then(() => true)
    .catch(() => false);
  if (diffCheck) {
    throw new Error('所选文件没有可提交的变更');
  }
  await runGit(repoPath, ['commit', '-m', defaultCommitMessage(workflow, input), '--only', '--', ...files], gitOptions);
  await assertRemoteNotAdvanced(repoPath, project.repository?.defaultBranch || 'master', gitOptions);
  await runGit(repoPath, ['push', 'origin', `HEAD:${project.repository?.defaultBranch || 'master'}`], gitOptions).catch((error) => {
    throw new Error(`Git push失败或远端已更新，请刷新仓库状态后重试: ${error.message}`);
  });
  const commitSha = (await runGit(repoPath, ['rev-parse', 'HEAD'], gitOptions)).trim();
  const filePayload = await Promise.all(files.map((file) => gitFileMetadata(repoPath, file)));
  const centerPath = input.review
    ? '/api/ai-delivery/reviews/with-artifact-git-sync'
    : `/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk(workflow, input)))}/artifact-git-syncs/complete`;
  const centerResult = await centerRequest(context, centerPath, {
    method: 'POST',
    body: JSON.stringify({
      requirementPk: requirementPk(workflow, input),
      stage: input.stage,
      syncType: inputSyncType,
      commitSha,
      baseCommitSha: repoState.headCommit,
      files: filePayload,
      review: input.review
    })
  });
  return {
    commitSha,
    pushed: true,
    centerResult
  };
}
