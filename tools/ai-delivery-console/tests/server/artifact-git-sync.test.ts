import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RequirementWorkflow } from '../../shared/workflow';
import { assertControlledArtifactPath, buildArtifactGitSyncPlan, confirmArtifactGitSync } from '../../server/services/artifact-git-sync';
import { cloneProjectRepository, readLocalRepoState, syncProjectRepository } from '../../server/services/project-repository';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await exec('git', args, { cwd });
}

function workflow(): RequirementWorkflow {
  return {
    id: 100,
    requirementId: '172014',
    title: '测试需求',
    requirementType: 'REQUIREMENT',
    branchName: 'feature/opp-172014',
    projects: [],
    sources: [],
    currentStage: 'IMPLEMENTATION',
    status: 'IN_PROGRESS',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stages: {
      PRD: { stage: 'PRD', status: 'APPROVED', artifactPath: 'docs/172014/prd/analysis.md' },
      TECH_DESIGN: { stage: 'TECH_DESIGN', status: 'APPROVED', artifactPath: 'docs/172014/technical-design/design_review.md' },
      IMPLEMENTATION: { stage: 'IMPLEMENTATION', status: 'IN_PROGRESS', changeName: 'req-172014' },
      CODE_REVIEW: { stage: 'CODE_REVIEW', status: 'PENDING' }
    },
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('artifact-git-sync', () => {
  it('允许当前需求、OpenSpec、Agent skill 和 Agent command 受控路径', () => {
    const current = workflow();

    expect(assertControlledArtifactPath(current, 'docs/172014/prd/analysis.md')).toBe('docs/172014/prd/analysis.md');
    expect(assertControlledArtifactPath(current, 'openspec/config.yaml')).toBe('openspec/config.yaml');
    expect(assertControlledArtifactPath(current, 'openspec/changes/req-172014/proposal.md')).toBe('openspec/changes/req-172014/proposal.md');
    expect(assertControlledArtifactPath(current, '.codex/skills/coding-design/SKILL.md')).toBe('.codex/skills/coding-design/SKILL.md');
    expect(assertControlledArtifactPath(current, '.qwen/commands/opsx-apply.toml')).toBe('.qwen/commands/opsx-apply.toml');
    expect(() => assertControlledArtifactPath(current, 'docs/172014/workflow/runs/run-1.jsonl')).toThrow('不在受控产物路径内');
  });

  it('拒绝绝对路径、目录逃逸和其他需求路径', () => {
    const current = workflow();

    expect(() => assertControlledArtifactPath(current, '/tmp/secret')).toThrow('不合法');
    expect(() => assertControlledArtifactPath(current, '../docs/172014/prd/analysis.md')).toThrow('不合法');
    expect(() => assertControlledArtifactPath(current, 'docs/999999/prd/analysis.md')).toThrow('不在受控产物路径内');
    expect(() => assertControlledArtifactPath(current, '.qoder/settings.local.json')).toThrow('不在受控产物路径内');
  });

  it('基于本地项目仓生成计划并确认 push', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-artifact-sync-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs', '172014', 'prd'), { recursive: true });
    await fs.mkdir(path.join(sourceRepo, 'docs', '172014', 'technical-design'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', '172014', 'prd', 'analysis.md'), 'old\n', 'utf8');
    await fs.writeFile(path.join(sourceRepo, 'docs', '172014', 'technical-design', 'design_review.md'), 'design old\n', 'utf8');
    await git(sourceRepo, ['init']);
    await git(sourceRepo, ['config', 'user.email', 'test@example.com']);
    await git(sourceRepo, ['config', 'user.name', 'Test']);
    await git(sourceRepo, ['add', '.']);
    await git(sourceRepo, ['commit', '-m', 'init']);
    await git(sourceRepo, ['branch', '-M', 'master']);
    await git(tempDir, ['clone', '--bare', sourceRepo, remoteRepo]);
    await fs.mkdir(path.join(deliveryRoot, '.ai-delivery', 'keys'), { recursive: true });
    await fs.writeFile(path.join(deliveryRoot, '.ai-delivery', 'keys', 'fp'), 'not-used-for-local-remote', 'utf8');

    const centerCalls: string[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      centerCalls.push(parsed.pathname);
      if (parsed.pathname === '/api/ai-delivery/users/me/delivery-workspace') {
        return jsonResponse({ id: 1, clientSessionId: 9, localPath: deliveryRoot, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/users/me/git-credentials') {
        return jsonResponse([{ id: 1, platform: 'PROJECT_GIT', fingerprint: 'fp', publicKey: 'ssh-ed25519 AAAA', status: 'ACTIVE' }]);
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([
          {
            id: 1,
            name: 'Demo',
            code: 'demo',
            repository: {
              id: 1,
              projectId: 1,
              provider: 'PROJECT_GIT',
              repoUrl: remoteRepo,
              defaultBranch: 'master',
              repoCode: 'demo',
              status: 'ACTIVE'
            }
          }
        ]);
      }
      if (parsed.pathname === '/api/ai-delivery/projects/1/repository-state') {
        return jsonResponse(JSON.parse(String(init?.body || '{}')));
      }
      if (parsed.pathname === '/api/ai-delivery/requirements/100/artifact-git-syncs/complete') {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(null, 404);
    };
    const context = {
      centerBaseUrl: 'http://center.local',
      userId: '1',
      clientSessionId: '9',
      projectId: '1',
      fetchImpl
    } as any;

    try {
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      await git(repoPath, ['config', 'user.email', 'test@example.com']);
      await git(repoPath, ['config', 'user.name', 'Test']);
      await fs.writeFile(path.join(repoPath, 'docs', '172014', 'prd', 'analysis.md'), 'old\nnew\n', 'utf8');
      await fs.writeFile(path.join(repoPath, 'docs', '172014', 'technical-design', 'design_review.md'), 'design old\npending\n', 'utf8');

      const plan = await buildArtifactGitSyncPlan(context, workflow(), { stage: 'PRD', syncType: 'PUBLIC_SYNC' });
      expect(plan.blocked).toBe(false);
      expect(plan.files.map((file) => file.path)).toContain('docs/172014/prd/analysis.md');
      expect(plan.files.map((file) => file.path)).toContain('docs/172014/technical-design/design_review.md');
      expect(plan.diff).toContain('diff --git');

      const result = await confirmArtifactGitSync(context, workflow(), {
        stage: 'PRD',
        syncType: 'PUBLIC_SYNC',
        requirementPk: 100,
        files: ['docs/172014/prd/analysis.md']
      });
      expect(result.pushed).toBe(true);
      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(centerCalls).toContain('/api/ai-delivery/requirements/100/artifact-git-syncs/complete');
      const { stdout: remainingDiff } = await exec('git', ['diff', '--', 'docs/172014/technical-design/design_review.md'], { cwd: repoPath });
      expect(remainingDiff).toContain('pending');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('公开同步支持 git add 未跟踪产物且不夹带未选择的 staged 文件', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-artifact-sync-add-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs', '172014', 'technical-design'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', '172014', 'technical-design', 'design_review.md'), 'design old\n', 'utf8');
    await git(sourceRepo, ['init']);
    await git(sourceRepo, ['config', 'user.email', 'test@example.com']);
    await git(sourceRepo, ['config', 'user.name', 'Test']);
    await git(sourceRepo, ['add', '.']);
    await git(sourceRepo, ['commit', '-m', 'init']);
    await git(sourceRepo, ['branch', '-M', 'master']);
    await git(tempDir, ['clone', '--bare', sourceRepo, remoteRepo]);
    await fs.mkdir(path.join(deliveryRoot, '.ai-delivery', 'keys'), { recursive: true });
    await fs.writeFile(path.join(deliveryRoot, '.ai-delivery', 'keys', 'fp'), 'not-used-for-local-remote', 'utf8');

    const centerCalls: string[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      centerCalls.push(parsed.pathname);
      if (parsed.pathname === '/api/ai-delivery/users/me/delivery-workspace') {
        return jsonResponse({ id: 1, clientSessionId: 9, localPath: deliveryRoot, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/users/me/git-credentials') {
        return jsonResponse([{ id: 1, platform: 'PROJECT_GIT', fingerprint: 'fp', publicKey: 'ssh-ed25519 AAAA', status: 'ACTIVE' }]);
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([
          {
            id: 1,
            name: 'Demo',
            code: 'demo',
            repository: {
              id: 1,
              projectId: 1,
              provider: 'PROJECT_GIT',
              repoUrl: remoteRepo,
              defaultBranch: 'master',
              repoCode: 'demo',
              status: 'ACTIVE'
            }
          }
        ]);
      }
      if (parsed.pathname === '/api/ai-delivery/projects/1/repository-state') {
        return jsonResponse(JSON.parse(String(init?.body || '{}')));
      }
      if (parsed.pathname === '/api/ai-delivery/requirements/100/artifact-git-syncs/complete') {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(null, 404);
    };
    const context = {
      centerBaseUrl: 'http://center.local',
      userId: '1',
      clientSessionId: '9',
      projectId: '1',
      fetchImpl
    } as any;

    try {
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      await git(repoPath, ['config', 'user.email', 'test@example.com']);
      await git(repoPath, ['config', 'user.name', 'Test']);
      await fs.mkdir(path.join(repoPath, 'docs', '172014', 'reports'), { recursive: true });
      await fs.writeFile(path.join(repoPath, 'docs', '172014', 'reports', 'manual.md'), '# manual\nnew artifact\n', 'utf8');
      await fs.writeFile(path.join(repoPath, 'docs', '172014', 'technical-design', 'design_review.md'), 'design old\nstaged but not selected\n', 'utf8');
      await git(repoPath, ['add', 'docs/172014/technical-design/design_review.md']);

      const plan = await buildArtifactGitSyncPlan(context, workflow(), { stage: 'TECH_DESIGN', syncType: 'PUBLIC_SYNC' });
      const reportFile = plan.files.find((file) => file.path === 'docs/172014/reports/manual.md');
      expect(reportFile?.status).toBe('??');
      expect(plan.diff).toContain('new file mode 100644');
      expect(plan.diff).toContain('+# manual');

      const result = await confirmArtifactGitSync(context, workflow(), {
        stage: 'TECH_DESIGN',
        syncType: 'PUBLIC_SYNC',
        requirementPk: 100,
        files: ['docs/172014/reports/manual.md']
      });

      expect(result.pushed).toBe(true);
      expect(centerCalls).toContain('/api/ai-delivery/requirements/100/artifact-git-syncs/complete');
      const { stdout: committedFiles } = await exec('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: repoPath });
      expect(committedFiles).toContain('docs/172014/reports/manual.md');
      expect(committedFiles).not.toContain('docs/172014/technical-design/design_review.md');
      const { stdout: remainingStagedDiff } = await exec('git', ['diff', '--cached', '--', 'docs/172014/technical-design/design_review.md'], { cwd: repoPath });
      expect(remainingStagedDiff).toContain('staged but not selected');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('同步项目仓后在交付工作区记录项目 commit 状态', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-state-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', 'README.md'), 'init\n', 'utf8');
    await git(sourceRepo, ['init']);
    await git(sourceRepo, ['config', 'user.email', 'test@example.com']);
    await git(sourceRepo, ['config', 'user.name', 'Test']);
    await git(sourceRepo, ['add', '.']);
    await git(sourceRepo, ['commit', '-m', 'init']);
    await git(sourceRepo, ['branch', '-M', 'master']);
    await git(tempDir, ['clone', '--bare', sourceRepo, remoteRepo]);
    await fs.mkdir(path.join(deliveryRoot, '.ai-delivery', 'keys'), { recursive: true });
    await fs.writeFile(path.join(deliveryRoot, '.ai-delivery', 'keys', 'fp'), 'not-used-for-local-remote', 'utf8');

    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/api/ai-delivery/users/me/delivery-workspace') {
        return jsonResponse({ id: 1, clientSessionId: 9, localPath: deliveryRoot, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/users/me/git-credentials') {
        return jsonResponse([{ id: 1, platform: 'PROJECT_GIT', fingerprint: 'fp', publicKey: 'ssh-ed25519 AAAA', status: 'ACTIVE' }]);
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([
          {
            id: 1,
            name: 'Demo',
            code: 'demo',
            repository: {
              id: 1,
              projectId: 1,
              provider: 'PROJECT_GIT',
              repoUrl: remoteRepo,
              defaultBranch: 'master',
              repoCode: 'demo',
              status: 'ACTIVE'
            }
          }
        ]);
      }
      if (parsed.pathname === '/api/ai-delivery/projects/1/repository-state') {
        return jsonResponse(JSON.parse(String(init?.body || '{}')));
      }
      return jsonResponse(null, 404);
    };
    const context = {
      centerBaseUrl: 'http://center.local',
      userId: '1',
      clientSessionId: '9',
      projectId: '1',
      fetchImpl
    } as any;

    try {
      const state = await syncProjectRepository(context);
      const localState = await readLocalRepoState(context, 1);

      expect(state.syncStatus).toBe('READY');
      expect(localState?.headCommit).toMatch(/^[a-f0-9]{40}$/);
      expect(localState?.localRepoPath).toBe(path.join(deliveryRoot, 'demo'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('同步项目仓时未跟踪文件不阻断拉取远端更新', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-untracked-sync-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', 'README.md'), 'init\n', 'utf8');
    await git(sourceRepo, ['init']);
    await git(sourceRepo, ['config', 'user.email', 'test@example.com']);
    await git(sourceRepo, ['config', 'user.name', 'Test']);
    await git(sourceRepo, ['add', '.']);
    await git(sourceRepo, ['commit', '-m', 'init']);
    await git(sourceRepo, ['branch', '-M', 'master']);
    await git(tempDir, ['clone', '--bare', sourceRepo, remoteRepo]);
    await git(sourceRepo, ['remote', 'add', 'origin', remoteRepo]);
    await fs.mkdir(path.join(deliveryRoot, '.ai-delivery', 'keys'), { recursive: true });
    await fs.writeFile(path.join(deliveryRoot, '.ai-delivery', 'keys', 'fp'), 'not-used-for-local-remote', 'utf8');

    const fetchImpl = projectRepoFetchImpl(deliveryRoot, remoteRepo);
    const context = {
      centerBaseUrl: 'http://center.local',
      userId: '1',
      clientSessionId: '9',
      projectId: '1',
      fetchImpl
    } as any;

    try {
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      await fs.mkdir(path.join(repoPath, '.codex', 'skills', 'coding-design'), { recursive: true });
      await fs.writeFile(path.join(repoPath, '.codex', 'skills', 'coding-design', 'SKILL.md'), '# local bootstrap\n', 'utf8');
      await fs.writeFile(path.join(sourceRepo, 'docs', 'REMOTE.md'), 'remote update\n', 'utf8');
      await git(sourceRepo, ['add', 'docs/REMOTE.md']);
      await git(sourceRepo, ['commit', '-m', 'remote update']);
      await git(sourceRepo, ['push', 'origin', 'master']);

      const state = await syncProjectRepository(context);

      expect(await fs.readFile(path.join(repoPath, 'docs', 'REMOTE.md'), 'utf8')).toBe('remote update\n');
      expect(await fs.readFile(path.join(repoPath, '.codex', 'skills', 'coding-design', 'SKILL.md'), 'utf8')).toBe('# local bootstrap\n');
      expect(state.syncStatus).toBe('DIRTY');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('同步项目仓时已跟踪文件有本地修改仍阻断', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-tracked-dirty-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', 'README.md'), 'init\n', 'utf8');
    await git(sourceRepo, ['init']);
    await git(sourceRepo, ['config', 'user.email', 'test@example.com']);
    await git(sourceRepo, ['config', 'user.name', 'Test']);
    await git(sourceRepo, ['add', '.']);
    await git(sourceRepo, ['commit', '-m', 'init']);
    await git(sourceRepo, ['branch', '-M', 'master']);
    await git(tempDir, ['clone', '--bare', sourceRepo, remoteRepo]);
    await fs.mkdir(path.join(deliveryRoot, '.ai-delivery', 'keys'), { recursive: true });
    await fs.writeFile(path.join(deliveryRoot, '.ai-delivery', 'keys', 'fp'), 'not-used-for-local-remote', 'utf8');

    const fetchImpl = projectRepoFetchImpl(deliveryRoot, remoteRepo);
    const context = {
      centerBaseUrl: 'http://center.local',
      userId: '1',
      clientSessionId: '9',
      projectId: '1',
      fetchImpl
    } as any;

    try {
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      await fs.writeFile(path.join(repoPath, 'docs', 'README.md'), 'local tracked change\n', 'utf8');

      await expect(syncProjectRepository(context)).rejects.toMatchObject({
        code: 'B70075',
        message: expect.stringContaining('已跟踪文件的本地修改')
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status < 400, data, message: status < 400 ? undefined : 'not found' }), { status });
}

function projectRepoFetchImpl(deliveryRoot: string, remoteRepo: string) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/ai-delivery/users/me/delivery-workspace') {
      return jsonResponse({ id: 1, clientSessionId: 9, localPath: deliveryRoot, status: 'ACTIVE' });
    }
    if (parsed.pathname === '/api/ai-delivery/users/me/git-credentials') {
      return jsonResponse([{ id: 1, platform: 'PROJECT_GIT', fingerprint: 'fp', publicKey: 'ssh-ed25519 AAAA', status: 'ACTIVE' }]);
    }
    if (parsed.pathname === '/api/ai-delivery/projects/my') {
      return jsonResponse([
        {
          id: 1,
          name: 'Demo',
          code: 'demo',
          repository: {
            id: 1,
            projectId: 1,
            provider: 'PROJECT_GIT',
            repoUrl: remoteRepo,
            defaultBranch: 'master',
            repoCode: 'demo',
            status: 'ACTIVE'
          }
        }
      ]);
    }
    if (parsed.pathname === '/api/ai-delivery/projects/1/repository-state') {
      return jsonResponse(JSON.parse(String(init?.body || '{}')));
    }
    return jsonResponse(null, 404);
  };
}
