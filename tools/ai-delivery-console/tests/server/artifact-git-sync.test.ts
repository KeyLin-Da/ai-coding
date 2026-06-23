import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createRouter } from '../../server/router';
import { assertControlledArtifactPath, buildArtifactGitSyncPlan, confirmArtifactGitSync } from '../../server/services/artifact-git-sync';
import { cloneProjectRepository, inspectProjectRepository, readLocalRepoState, readProjectRepositoryStatus, syncProjectRepository } from '../../server/services/project-repository';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await exec('git', args, { cwd });
}

function routerRequest(method: string, url: string, headers: IncomingMessage['headers'], body = ''): IncomingMessage {
  const stream = new Readable({
    read() {
      this.push(body || null);
      this.push(null);
    }
  }) as IncomingMessage;
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function routerResponse(): { response: ServerResponse; done: Promise<{ status: number; body: any }> } {
  let status = 0;
  let resolveDone!: (value: { status: number; body: any }) => void;
  const done = new Promise<{ status: number; body: any }>((resolve) => {
    resolveDone = resolve;
  });
  const response = {
    writeHead(nextStatus: number) {
      status = nextStatus;
    },
    end(rawBody: string) {
      resolveDone({
        status,
        body: rawBody ? JSON.parse(rawBody) : undefined
      });
    }
  } as unknown as ServerResponse;
  return { response, done };
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('允许当前需求、OpenSpec、Agent skill 和 Agent command 受控路径', () => {
    const current = workflow();

    expect(assertControlledArtifactPath(current, 'docs/172014/prd/analysis.md')).toBe('docs/172014/prd/analysis.md');
    expect(assertControlledArtifactPath(current, 'openspec/config.yaml')).toBe('openspec/config.yaml');
    expect(assertControlledArtifactPath(current, 'openspec/changes/req-172014/proposal.md')).toBe('openspec/changes/req-172014/proposal.md');
    expect(assertControlledArtifactPath(current, '.codex/skills/coding-design/SKILL.md')).toBe('.codex/skills/coding-design/SKILL.md');
    expect(assertControlledArtifactPath(current, '.qwen/commands/opsx-apply.toml')).toBe('.qwen/commands/opsx-apply.toml');
    expect(assertControlledArtifactPath(current, 'docs/172014/reports/implementation-report.md')).toBe('docs/172014/reports/implementation-report.md');
    expect(() => assertControlledArtifactPath(current, 'docs/172014/workflow/runs/run-1.jsonl')).toThrow('不在受控产物路径内');
    expect(() => assertControlledArtifactPath(current, 'docs/172014/reports/run-20260610085925-588899.log')).toThrow('不在受控产物路径内');
  });

  it('拒绝绝对路径、目录逃逸和其他需求路径', () => {
    const current = workflow();

    expect(() => assertControlledArtifactPath(current, '/tmp/secret')).toThrow('不合法');
    expect(() => assertControlledArtifactPath(current, '../docs/172014/prd/analysis.md')).toThrow('不合法');
    expect(() => assertControlledArtifactPath(current, 'docs/999999/prd/analysis.md')).toThrow('不在受控产物路径内');
    expect(() => assertControlledArtifactPath(current, '.qoder/settings.local.json')).toThrow('不在受控产物路径内');
  });

  it('公开同步仍拒绝空文件列表', async () => {
    await expect(confirmArtifactGitSync({} as any, workflow(), {
      stage: 'PRD',
      syncType: 'PUBLIC_SYNC',
      requirementPk: 100,
      files: []
    })).rejects.toThrow('请至少选择一个需要同步的产物文件');
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
      if (parsed.pathname === '/api/ai-delivery/projects/1/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 1, localPath: deliveryRoot, status: 'ACTIVE' });
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

  it('审核同步计划为空时不推送并直接提交审核结论', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-artifact-sync-empty-review-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs', '172014', 'technical-design'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', '172014', 'technical-design', 'design_review.md'), 'design synced\n', 'utf8');
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
    const reviewBodies: any[] = [];
    const baseFetch = projectRepoFetchImpl(deliveryRoot, remoteRepo);
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      centerCalls.push(`${init?.method || 'GET'} ${parsed.pathname}`);
      if (parsed.pathname === '/api/ai-delivery/reviews') {
        reviewBodies.push(JSON.parse(String(init?.body || '{}')));
        return jsonResponse({ reviewed: true });
      }
      return baseFetch(url, init);
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
      const { stdout: headBefore } = await exec('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

      const result = await confirmArtifactGitSync(context, workflow(), {
        stage: 'IMPLEMENTATION',
        syncType: 'REVIEW_APPROVAL',
        requirementPk: 100,
        files: [],
        review: {
          decision: 'APPROVED',
          comment: '通过'
        }
      });

      const { stdout: headAfter } = await exec('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
      expect(result).toEqual({
        pushed: false,
        centerResult: {
          reviewed: true
        }
      });
      expect(headAfter.trim()).toBe(headBefore.trim());
      expect(centerCalls).toContain('POST /api/ai-delivery/reviews');
      expect(centerCalls).not.toContain('POST /api/ai-delivery/reviews/with-artifact-git-sync');
      expect(reviewBodies[0]).toEqual({
        requirementPk: 100,
        requirementId: '172014',
        stage: 'IMPLEMENTATION',
        decision: 'APPROVED',
        comment: '通过'
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('审核同步拒绝携带实施验证子步骤，子步骤应走普通审核', async () => {
    await expect(confirmArtifactGitSync({} as any, workflow(), {
      stage: 'IMPLEMENTATION',
      syncType: 'REVIEW_APPROVAL',
      requirementPk: 100,
      files: [],
      review: {
        decision: 'APPROVED',
        comment: '子步骤通过',
        implementationStep: 'CHANGE_INSPECTION'
      }
    })).rejects.toThrow('顶层审核同步不能携带实施验证子步骤');
  });

  it('空文件审核确认前发现受控变更时要求刷新同步计划', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-artifact-sync-empty-review-dirty-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs', '172014', 'prd'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', '172014', 'prd', 'analysis.md'), 'prd synced\n', 'utf8');
    await git(sourceRepo, ['init']);
    await git(sourceRepo, ['config', 'user.email', 'test@example.com']);
    await git(sourceRepo, ['config', 'user.name', 'Test']);
    await git(sourceRepo, ['add', '.']);
    await git(sourceRepo, ['commit', '-m', 'init']);
    await git(sourceRepo, ['branch', '-M', 'master']);
    await git(tempDir, ['clone', '--bare', sourceRepo, remoteRepo]);
    await fs.mkdir(path.join(deliveryRoot, '.ai-delivery', 'keys'), { recursive: true });
    await fs.writeFile(path.join(deliveryRoot, '.ai-delivery', 'keys', 'fp'), 'not-used-for-local-remote', 'utf8');

    const context = {
      centerBaseUrl: 'http://center.local',
      userId: '1',
      clientSessionId: '9',
      projectId: '1',
      fetchImpl: projectRepoFetchImpl(deliveryRoot, remoteRepo)
    } as any;

    try {
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      await fs.writeFile(path.join(repoPath, 'docs', '172014', 'prd', 'analysis.md'), 'prd synced\nnew local change\n', 'utf8');

      await expect(confirmArtifactGitSync(context, workflow(), {
        stage: 'PRD',
        syncType: 'REVIEW_APPROVAL',
        requirementPk: 100,
        files: [],
        review: {
          decision: 'APPROVED',
          comment: ''
        }
      })).rejects.toThrow('当前仍有待同步产物文件');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('确认同步时发现所选文件已不在当前变更中则提示刷新计划', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-artifact-sync-stale-plan-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(sourceRepo, 'docs', '172014', 'technical-design'), { recursive: true });
    await fs.writeFile(path.join(sourceRepo, 'docs', '172014', 'technical-design', 'design_review.md'), 'design synced\n', 'utf8');
    await git(sourceRepo, ['init']);
    await git(sourceRepo, ['config', 'user.email', 'test@example.com']);
    await git(sourceRepo, ['config', 'user.name', 'Test']);
    await git(sourceRepo, ['add', '.']);
    await git(sourceRepo, ['commit', '-m', 'init']);
    await git(sourceRepo, ['branch', '-M', 'master']);
    await git(tempDir, ['clone', '--bare', sourceRepo, remoteRepo]);
    await fs.mkdir(path.join(deliveryRoot, '.ai-delivery', 'keys'), { recursive: true });
    await fs.writeFile(path.join(deliveryRoot, '.ai-delivery', 'keys', 'fp'), 'not-used-for-local-remote', 'utf8');

    const context = {
      centerBaseUrl: 'http://center.local',
      userId: '1',
      clientSessionId: '9',
      projectId: '1',
      fetchImpl: projectRepoFetchImpl(deliveryRoot, remoteRepo)
    } as any;

    try {
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      const stalePath = 'openspec/changes/req-172014/design.md';
      await fs.mkdir(path.dirname(path.join(repoPath, stalePath)), { recursive: true });
      await fs.writeFile(path.join(repoPath, stalePath), 'temporary design\n', 'utf8');
      const plan = await buildArtifactGitSyncPlan(context, workflow(), { stage: 'IMPLEMENTATION', syncType: 'REVIEW_APPROVAL' });
      expect(plan.files.map((file) => file.path)).toContain(stalePath);
      await fs.rm(path.join(repoPath, stalePath));

      await expect(confirmArtifactGitSync(context, workflow(), {
        stage: 'IMPLEMENTATION',
        syncType: 'REVIEW_APPROVAL',
        requirementPk: 100,
        files: [stalePath],
        review: {
          decision: 'APPROVED',
          comment: ''
        }
      })).rejects.toThrow(`同步计划已过期，请返回上一步重新生成同步计划后重试：${stalePath}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('审核同步支持已暂存删除文件和未跟踪文件混合提交', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-artifact-sync-staged-delete-'));
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    const changeDir = path.join(sourceRepo, 'openspec', 'changes', 'req-172014');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, 'design.md'), 'design\n', 'utf8');
    await fs.writeFile(path.join(changeDir, 'proposal.md'), 'proposal\n', 'utf8');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), 'tasks\n', 'utf8');
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
    const baseFetch = projectRepoFetchImpl(deliveryRoot, remoteRepo);
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      centerCalls.push(`${init?.method || 'GET'} ${parsed.pathname}`);
      if (parsed.pathname === '/api/ai-delivery/reviews/with-artifact-git-sync') {
        return jsonResponse({ reviewed: true });
      }
      return baseFetch(url, init);
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
      const files = [
        'openspec/changes/req-172014/design.md',
        'openspec/changes/req-172014/proposal.md',
        'openspec/changes/req-172014/tasks.md',
        'openspec/changes/req-172014/.openspec.yaml'
      ];
      await fs.rm(path.join(repoPath, files[0]));
      await fs.rm(path.join(repoPath, files[1]));
      await fs.rm(path.join(repoPath, files[2]));
      await git(repoPath, ['add', '--', files[0], files[1], files[2]]);
      await fs.writeFile(path.join(repoPath, files[3]), 'id: req-172014\n', 'utf8');

      const plan = await buildArtifactGitSyncPlan(context, workflow(), { stage: 'IMPLEMENTATION', syncType: 'REVIEW_APPROVAL' });
      expect(plan.files.map((file) => file.path)).toEqual(expect.arrayContaining(files));

      const result = await confirmArtifactGitSync(context, workflow(), {
        stage: 'IMPLEMENTATION',
        syncType: 'REVIEW_APPROVAL',
        requirementPk: 100,
        files,
        review: {
          decision: 'APPROVED',
          comment: ''
        }
      });

      expect(result.pushed).toBe(true);
      expect(centerCalls).toContain('POST /api/ai-delivery/reviews/with-artifact-git-sync');
      const { stdout: committedFiles } = await exec('git', ['show', '--name-status', '--format=', 'HEAD'], { cwd: repoPath });
      expect(committedFiles).toContain(`A\t${files[3]}`);
      expect(committedFiles).toContain(`D\t${files[0]}`);
      expect(committedFiles).toContain(`D\t${files[1]}`);
      expect(committedFiles).toContain(`D\t${files[2]}`);
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
      if (parsed.pathname === '/api/ai-delivery/projects/1/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 1, localPath: deliveryRoot, status: 'ACTIVE' });
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
      await fs.writeFile(path.join(repoPath, 'docs', '172014', 'reports', 'run-20260610085925-588899.log'), 'runtime log\n', 'utf8');
      await fs.writeFile(path.join(repoPath, 'docs', '172014', 'technical-design', 'design_review.md'), 'design old\nstaged but not selected\n', 'utf8');
      await git(repoPath, ['add', 'docs/172014/technical-design/design_review.md']);

      const plan = await buildArtifactGitSyncPlan(context, workflow(), { stage: 'TECH_DESIGN', syncType: 'PUBLIC_SYNC' });
      const reportFile = plan.files.find((file) => file.path === 'docs/172014/reports/manual.md');
      const runLogFile = plan.files.find((file) => file.path === 'docs/172014/reports/run-20260610085925-588899.log');
      expect(reportFile?.status).toBe('??');
      expect(runLogFile).toBeUndefined();
      expect(plan.diff).toContain('new file mode 100644');
      expect(plan.diff).toContain('+# manual');
      expect(plan.diff).not.toContain('runtime log');

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
      if (parsed.pathname === '/api/ai-delivery/projects/1/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 1, localPath: deliveryRoot, status: 'ACTIVE' });
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

  it('轻量读取项目仓状态时不拉取远端也不回写中心', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-fast-status-'));
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

    const centerCalls: string[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      centerCalls.push(`${init?.method || 'GET'} ${parsed.pathname}`);
      if (parsed.pathname === '/api/ai-delivery/projects/1/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 1, localPath: deliveryRoot, status: 'ACTIVE' });
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
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      await fs.writeFile(path.join(sourceRepo, 'docs', 'REMOTE.md'), 'remote update\n', 'utf8');
      await git(sourceRepo, ['add', 'docs/REMOTE.md']);
      await git(sourceRepo, ['commit', '-m', 'remote update']);
      await git(sourceRepo, ['push', 'origin', 'master']);
      centerCalls.length = 0;

      // 场景意图：普通状态读取只看本地引用，不因为远端已有新提交而执行 fetch。
      const state = await readProjectRepositoryStatus(context);

      expect(state.syncStatus).toBe('READY');
      expect(await fs.stat(path.join(repoPath, 'docs', 'REMOTE.md')).catch(() => null)).toBeNull();
      expect(centerCalls).not.toContain('GET /api/ai-delivery/users/me/git-credentials');
      expect(centerCalls).not.toContain('POST /api/ai-delivery/projects/1/repository-state');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('轻量读取项目仓状态时能发现本机未提交修改', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-fast-dirty-'));
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

    const centerCalls: string[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      centerCalls.push(`${init?.method || 'GET'} ${parsed.pathname}`);
      if (parsed.pathname === '/api/ai-delivery/projects/1/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 1, localPath: deliveryRoot, status: 'ACTIVE' });
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
      await cloneProjectRepository(context);
      const repoPath = path.join(deliveryRoot, 'demo');
      await fs.writeFile(path.join(repoPath, 'docs', 'README.md'), 'init\nlocal edit\n', 'utf8');
      centerCalls.length = 0;

      // 场景意图：即使不信任缓存，快检也要通过本地 git status 识别当前用户修改。
      const state = await readProjectRepositoryStatus(context);

      expect(state.syncStatus).toBe('DIRTY');
      expect(centerCalls).not.toContain('GET /api/ai-delivery/users/me/git-credentials');
      expect(centerCalls).not.toContain('POST /api/ai-delivery/projects/1/repository-state');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('强刷新项目仓状态时仍拉取远端并回写中心', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-refresh-status-'));
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

    const centerCalls: string[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      centerCalls.push(`${init?.method || 'GET'} ${parsed.pathname}`);
      if (parsed.pathname === '/api/ai-delivery/projects/1/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 1, localPath: deliveryRoot, status: 'ACTIVE' });
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
      await cloneProjectRepository(context);
      await fs.writeFile(path.join(sourceRepo, 'docs', 'REMOTE.md'), 'remote update\n', 'utf8');
      await git(sourceRepo, ['add', 'docs/REMOTE.md']);
      await git(sourceRepo, ['commit', '-m', 'remote update']);
      await git(sourceRepo, ['push', 'origin', 'master']);
      centerCalls.length = 0;

      // 场景意图：强刷新保留原有远端一致性校验，并继续上报中心状态。
      const state = await inspectProjectRepository(context);

      expect(state.syncStatus).toBe('BEHIND_REMOTE');
      expect(centerCalls).toContain('GET /api/ai-delivery/users/me/git-credentials');
      expect(centerCalls).toContain('POST /api/ai-delivery/projects/1/repository-state');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('路由同步项目仓时不更新当前项目 Skill', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-route-sync-no-skill-'));
    const workspaceRoot = path.join(tempDir, 'workspace');
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(workspaceRoot, 'skills', 'coding-design'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'skills', 'coding-design', 'SKILL.md'), '# source skill\n', 'utf8');
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
    vi.stubGlobal('fetch', fetchImpl);
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
      const router = createRouter(workspaceRoot);
      const result = routerResponse();
      await router(
        routerRequest('POST', '/api/ai-delivery/projects/1/repository/sync', {
          'x-user-id': '1',
          'x-project-id': '1',
          'x-client-session-id': '9',
          'x-center-base-url': 'http://center.local'
        }),
        result.response
      );
      const { status, body } = await result.done;

      expect(status).toBe(200);
      expect(body.data.syncStatus).toBe('READY');
      await expect(fs.stat(path.join(repoPath, '.codex', 'skills', 'coding-design', 'SKILL.md'))).rejects.toThrow();
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('路由支持显式更新当前项目 Skill 并刷新仓库状态', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-route-skill-update-'));
    const workspaceRoot = path.join(tempDir, 'workspace');
    const sourceRepo = path.join(tempDir, 'source');
    const remoteRepo = path.join(tempDir, 'remote.git');
    const deliveryRoot = path.join(tempDir, 'delivery');
    await fs.mkdir(path.join(workspaceRoot, 'skills', 'coding-design'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'skills', 'coding-design', 'SKILL.md'), '# source skill\n', 'utf8');
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
    vi.stubGlobal('fetch', fetchImpl);
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
      const router = createRouter(workspaceRoot);
      const result = routerResponse();
      await router(
        routerRequest('POST', '/api/ai-delivery/projects/1/skills/update', {
          'x-user-id': '1',
          'x-project-id': '1',
          'x-client-session-id': '9',
          'x-center-base-url': 'http://center.local'
        }),
        result.response
      );
      const { status, body } = await result.done;

      expect(status).toBe(200);
      expect(body.data.bootstrap.codingSkills.synced).toBe(1);
      expect(body.data.state.syncStatus).toBe('DIRTY');
      expect(await fs.readFile(path.join(repoPath, '.codex', 'skills', 'coding-design', 'SKILL.md'), 'utf8')).toBe('# source skill\n');
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
    if (parsed.pathname === '/api/ai-delivery/projects/1/delivery-workspace') {
      return jsonResponse({ id: 1, projectId: 1, localPath: deliveryRoot, status: 'ACTIVE' });
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
