import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { LocalRequestContext } from './local-request-context';
import { centerRequest } from './center-client';
import { assertInsideDeliveryWorkspace, requireDeliveryWorkspaceRoot } from './delivery-workspace';
import { localServiceError } from './local-errors';
import { privateKeyPathForCredential, requireActiveGitCredential } from './local-git-credentials';

export type ProjectRepoSyncStatus = 'NOT_CLONED' | 'READY' | 'BEHIND_REMOTE' | 'DIRTY' | 'CONFLICTING' | 'PUSHING' | 'PUSHED' | 'FAILED';

export interface ProjectRepositoryPayload {
  id: number;
  projectId: number;
  provider: string;
  repoUrl: string;
  defaultBranch: string;
  repoCode: string;
  status: string;
}

export interface DeliveryProjectPayload {
  id: number;
  name: string;
  code: string;
  repository?: ProjectRepositoryPayload;
}

export interface ProjectRepoStatePayload {
  projectId: number;
  clientSessionId: number;
  localRepoPath: string;
  currentBranch?: string;
  headCommit?: string;
  remoteCommit?: string;
  syncStatus: ProjectRepoSyncStatus;
  lastCheckedAt?: string;
}

export interface GitCommandOptions {
  privateKeyPath?: string;
}

function projectRepoBlockedError(message: string): Error & { code?: string } {
  const error = new Error(message) as Error & { code?: string };
  error.code = 'B70075';
  return error;
}

function isUntrackedOverwriteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /untracked working tree files would be overwritten|would be overwritten by merge|would be overwritten by checkout/i.test(message);
}

function toSshUrl(url: string): string {
  if (url.startsWith('git@')) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return url;
    }
    const host = parsed.host;
    let pathname = parsed.pathname;
    if (pathname.endsWith('.git')) {
      pathname = pathname.slice(0, -4);
    }
    // e.g. https://github.com/owner/repo -> git@github.com:owner/repo.git
    return `git@${host}:${pathname.replace(/^\//, '')}.git`;
  } catch {
    return url;
  }
}

export function runGit(cwd: string, args: string[], options: GitCommandOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...(options.privateKeyPath
        ? {
            GIT_SSH_COMMAND: `ssh -i "${options.privateKeyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`
          }
        : {})
    };
    const child = spawn('git', args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `git ${args.join(' ')} 退出码: ${code}`));
    });
  });
}

export async function loadCurrentDeliveryProject(context: LocalRequestContext): Promise<DeliveryProjectPayload> {
  const projectId = String(context.projectId || '').trim();
  if (!projectId) {
    throw localServiceError('B70003', '请先选择项目');
  }
  const projects = await centerRequest<DeliveryProjectPayload[]>(context, '/api/ai-delivery/projects/my');
  const project = projects.find((item) => String(item.id) === projectId);
  if (!project) {
    throw localServiceError('B70002', '当前用户无权访问所选项目');
  }
  if (!project.repository?.repoUrl) {
    throw localServiceError('B70073', '当前项目未配置AI产物Git仓');
  }
  return project;
}

export async function resolveProjectRepoPath(context: LocalRequestContext): Promise<{ project: DeliveryProjectPayload; repoPath: string; root: string }> {
  const root = await requireDeliveryWorkspaceRoot(context);
  const project = await loadCurrentDeliveryProject(context);
  const repoCode = project.repository?.repoCode || project.code;
  const repoPath = assertInsideDeliveryWorkspace(root, path.join(root, repoCode));
  return { project, repoPath, root };
}

async function credentialOptions(context: LocalRequestContext, project: DeliveryProjectPayload): Promise<GitCommandOptions> {
  const credential = await requireActiveGitCredential(context, project.repository?.provider || 'PROJECT_GIT');
  const privateKeyPath = await privateKeyPathForCredential(context, credential);
  await fs.access(privateKeyPath).catch(() => {
    throw localServiceError('B70072', '本机Git私钥不存在，请重新生成Git凭证');
  });
  return { privateKeyPath };
}

async function postRepoState(
  context: LocalRequestContext,
  projectId: string | number,
  state: ProjectRepoStatePayload
): Promise<ProjectRepoStatePayload> {
  await saveLocalRepoState(context, state).catch(() => undefined);
  return centerRequest<ProjectRepoStatePayload>(context, `/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/repository-state`, {
    method: 'POST',
    body: JSON.stringify(state)
  });
}

async function localRepoStatePath(context: LocalRequestContext, projectId: string | number): Promise<string> {
  const root = await requireDeliveryWorkspaceRoot(context);
  return repoStatePath(root, projectId);
}

function repoStatePath(root: string, projectId: string | number): string {
  return assertInsideDeliveryWorkspace(root, path.join(root, '.ai-delivery', 'projects', String(projectId), 'repo-state.json'));
}

function requireClientSessionId(context: LocalRequestContext): number {
  const clientSessionId = Number(context.clientSessionId || 0);
  if (!clientSessionId) {
    throw localServiceError('B70003', '缺少客户端会话ID');
  }
  return clientSessionId;
}

export async function saveLocalRepoState(context: LocalRequestContext, state: ProjectRepoStatePayload): Promise<void> {
  const filePath = await localRepoStatePath(context, state.projectId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ ...state, lastCheckedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

export async function readLocalRepoState(context: LocalRequestContext, projectId: string | number): Promise<ProjectRepoStatePayload | undefined> {
  const filePath = await localRepoStatePath(context, projectId);
  const content = await fs.readFile(filePath, 'utf8').catch(() => undefined);
  return content ? (JSON.parse(content) as ProjectRepoStatePayload) : undefined;
}

async function readLocalRepoStateFromRoot(root: string, projectId: string | number): Promise<ProjectRepoStatePayload | undefined> {
  const content = await fs.readFile(repoStatePath(root, projectId), 'utf8').catch(() => undefined);
  return content ? (JSON.parse(content) as ProjectRepoStatePayload) : undefined;
}

export async function readProjectRepositoryStatus(context: LocalRequestContext): Promise<ProjectRepoStatePayload> {
  const { project, repoPath, root } = await resolveProjectRepoPath(context);
  const repository = project.repository;
  if (!repository) {
    throw localServiceError('B70073', '当前项目未配置AI产物Git仓');
  }
  const clientSessionId = requireClientSessionId(context);
  const cached = await readLocalRepoStateFromRoot(root, project.id);
  const exists = await fs.stat(repoPath).then((stat) => stat.isDirectory()).catch(() => false);
  if (!exists) {
    return {
      projectId: project.id,
      clientSessionId,
      localRepoPath: repoPath,
      syncStatus: 'NOT_CLONED',
      lastCheckedAt: cached?.lastCheckedAt
    };
  }

  const targetBranch = repository.defaultBranch || 'master';
  let currentBranch = cached?.currentBranch || '';
  let headCommit = cached?.headCommit || '';
  let remoteCommit = cached?.remoteCommit || '';
  let syncStatus: ProjectRepoSyncStatus = 'READY';
  try {
    currentBranch = (await runGit(repoPath, ['branch', '--show-current'])).trim();
    headCommit = (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim();
    const status = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all'])).trim();
    let behind = 0;
    try {
      remoteCommit = (await runGit(repoPath, ['rev-parse', `origin/${targetBranch}`])).trim();
      const counts = (await runGit(repoPath, ['rev-list', '--left-right', '--count', `HEAD...origin/${targetBranch}`])).trim();
      const [, behindRaw] = counts.split(/\s+/);
      behind = Number(behindRaw || 0);
    } catch {
      syncStatus = status ? 'DIRTY' : 'FAILED';
    }
    if (behind > 0) {
      syncStatus = 'BEHIND_REMOTE';
    } else if (status) {
      syncStatus = 'DIRTY';
    }
  } catch {
    syncStatus = 'FAILED';
  }

  return {
    projectId: project.id,
    clientSessionId,
    localRepoPath: repoPath,
    currentBranch,
    headCommit,
    remoteCommit,
    syncStatus,
    lastCheckedAt: cached?.lastCheckedAt
  };
}

export async function cloneProjectRepository(context: LocalRequestContext): Promise<ProjectRepoStatePayload> {
  const { project, repoPath } = await resolveProjectRepoPath(context);
  const repository = project.repository;
  if (!repository) {
    throw localServiceError('B70073', '当前项目未配置AI产物Git仓');
  }
  const options = await credentialOptions(context, project);
  const exists = await fs.stat(repoPath).then((stat) => stat.isDirectory()).catch(() => false);
  if (!exists) {
    await fs.mkdir(path.dirname(repoPath), { recursive: true });
    const sshUrl = toSshUrl(repository.repoUrl);
    await runGit(path.dirname(repoPath), ['clone', '--branch', repository.defaultBranch || 'master', sshUrl, repoPath], options);
  }
  return inspectProjectRepository(context);
}

export async function syncProjectRepository(context: LocalRequestContext): Promise<ProjectRepoStatePayload> {
  const { project, repoPath } = await resolveProjectRepoPath(context);
  const repository = project.repository;
  if (!repository) {
    throw localServiceError('B70073', '当前项目未配置AI产物Git仓');
  }
  const exists = await fs.stat(repoPath).then((stat) => stat.isDirectory()).catch(() => false);
  if (!exists) {
    return cloneProjectRepository(context);
  }

  const options = await credentialOptions(context, project);
  const targetBranch = repository.defaultBranch || 'master';
  const trackedStatus = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=no'])).trim();
  if (trackedStatus) {
    const state = await inspectProjectRepository(context);
    throw projectRepoBlockedError(state.syncStatus === 'BEHIND_REMOTE'
      ? '项目产物仓存在已跟踪文件的本地修改且落后远端，请先公开同步或清理本地变更'
      : '项目产物仓存在已跟踪文件的本地修改，请先公开同步或清理后再同步Git仓');
  }

  await runGit(repoPath, ['fetch', 'origin', targetBranch], options);
  const currentBranch = (await runGit(repoPath, ['branch', '--show-current'])).trim();
  if (currentBranch !== targetBranch) {
    try {
      await runGit(repoPath, ['checkout', targetBranch], options);
    } catch (error) {
      if (isUntrackedOverwriteError(error)) {
        throw projectRepoBlockedError('项目产物仓存在会被远端覆盖的未跟踪文件，请先公开同步或清理后再同步Git仓');
      }
      throw error;
    }
  }
  try {
    await runGit(repoPath, ['pull', '--ff-only', 'origin', targetBranch], options);
  } catch (error) {
    if (isUntrackedOverwriteError(error)) {
      throw projectRepoBlockedError('项目产物仓存在会被远端覆盖的未跟踪文件，请先公开同步或清理后再同步Git仓');
    }
    throw error;
  }
  return inspectProjectRepository(context);
}

export async function inspectProjectRepository(context: LocalRequestContext): Promise<ProjectRepoStatePayload> {
  const { project, repoPath } = await resolveProjectRepoPath(context);
  const repository = project.repository;
  if (!repository) {
    throw localServiceError('B70073', '当前项目未配置AI产物Git仓');
  }
  const clientSessionId = requireClientSessionId(context);
  const exists = await fs.stat(repoPath).then((stat) => stat.isDirectory()).catch(() => false);
  if (!exists) {
    return postRepoState(context, project.id, {
      projectId: project.id,
      clientSessionId,
      localRepoPath: repoPath,
      syncStatus: 'NOT_CLONED'
    });
  }

  const options = await credentialOptions(context, project);
  let currentBranch = '';
  let headCommit = '';
  let remoteCommit = '';
  let syncStatus: ProjectRepoSyncStatus = 'READY';
  try {
    await runGit(repoPath, ['fetch', 'origin', repository.defaultBranch || 'master'], options);
    currentBranch = (await runGit(repoPath, ['branch', '--show-current'])).trim();
    headCommit = (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim();
    remoteCommit = (await runGit(repoPath, ['rev-parse', `origin/${repository.defaultBranch || 'master'}`])).trim();
    const status = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all'])).trim();
    const counts = (await runGit(repoPath, ['rev-list', '--left-right', '--count', `HEAD...origin/${repository.defaultBranch || 'master'}`])).trim();
    const [, behindRaw] = counts.split(/\s+/);
    const behind = Number(behindRaw || 0);
    if (behind > 0) {
      syncStatus = 'BEHIND_REMOTE';
    } else if (status) {
      syncStatus = 'DIRTY';
    }
  } catch {
    syncStatus = 'FAILED';
  }

  return postRepoState(context, project.id, {
    projectId: project.id,
    clientSessionId,
    localRepoPath: repoPath,
    currentBranch,
    headCommit,
    remoteCommit,
    syncStatus
  });
}

export interface CommitPushInput {
  message?: string;
}

export async function commitAndPushProjectRepository(
  context: LocalRequestContext,
  input: CommitPushInput = {}
): Promise<ProjectRepoStatePayload> {
  const { project, repoPath } = await resolveProjectRepoPath(context);
  const repository = project.repository;
  if (!repository) {
    throw localServiceError('B70073', '当前项目未配置AI产物Git仓');
  }
  const options = await credentialOptions(context, project);

  const targetBranch = repository.defaultBranch || 'master';
  const currentBranch = (await runGit(repoPath, ['branch', '--show-current'])).trim();
  const initialStatus = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all'])).trim();
  if (currentBranch !== targetBranch) {
    if (initialStatus) {
      throw projectRepoBlockedError('项目产物仓当前不在默认分支，且存在本地变更，请先切回默认分支或清理本地变更后再提交');
    }
    try {
      await runGit(repoPath, ['checkout', targetBranch], options);
    } catch (error) {
      if (isUntrackedOverwriteError(error)) {
        throw projectRepoBlockedError('项目产物仓存在会被默认分支覆盖的未跟踪文件，请先清理后再提交');
      }
      throw error;
    }
  }

  await runGit(repoPath, ['fetch', 'origin', targetBranch], options);
  const counts = (await runGit(repoPath, ['rev-list', '--left-right', '--count', `HEAD...origin/${targetBranch}`])).trim();
  const [, behindRaw] = counts.split(/\s+/);
  const behind = Number(behindRaw || 0);
  const statusBeforeCommit = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all'])).trim();
  if (behind > 0) {
    if (statusBeforeCommit) {
      throw projectRepoBlockedError('项目产物仓落后远端且存在本地变更，请先同步 Git 仓或手动处理本地变更后再提交');
    }
    await runGit(repoPath, ['pull', '--ff-only', 'origin', targetBranch], options);
  }

  await runGit(repoPath, ['add', '-A'], options);

  const status = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all'])).trim();
  if (!status) {
    return inspectProjectRepository(context);
  }

  const message = input.message?.trim() || `sync: 自动同步产物 (${new Date().toLocaleString('zh-CN')})`;
  await runGit(repoPath, ['commit', '-m', message], options);

  try {
    await runGit(repoPath, ['push', 'origin', targetBranch], options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    throw new Error(`Git push失败或远端已更新，请同步 Git 仓后重试: ${message}`);
  }

  return inspectProjectRepository(context);
}
