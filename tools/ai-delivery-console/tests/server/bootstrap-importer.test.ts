import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBootstrapImportPlan, importBootstrapPlan } from '../../server/services/bootstrap-importer';
import { confirmArtifactGitSync } from '../../server/services/artifact-git-sync';
import { resolveProjectRepoPath, runGit, syncProjectRepository } from '../../server/services/project-repository';

vi.mock('../../server/services/artifact-git-sync', () => ({
  confirmArtifactGitSync: vi.fn()
}));

vi.mock('../../server/services/project-repository', () => ({
  resolveProjectRepoPath: vi.fn(),
  runGit: vi.fn(),
  syncProjectRepository: vi.fn()
}));

let sourceRoot = '';
let repoRoot = '';

describe('bootstrap-importer', () => {
  beforeEach(async () => {
    sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-source-'));
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-repo-'));
    vi.clearAllMocks();
    vi.mocked(syncProjectRepository).mockResolvedValue({
      projectId: 10,
      clientSessionId: 11,
      localRepoPath: repoRoot,
      syncStatus: 'READY'
    });
    vi.mocked(resolveProjectRepoPath).mockResolvedValue({
      project: {
        id: 10,
        name: 'AI Delivery',
        code: 'ai-delivery',
        repository: {
          id: 1,
          projectId: 10,
          provider: 'GITLAB',
          repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
          defaultBranch: 'master',
          repoCode: 'ai-delivery',
          status: 'ACTIVE'
        }
      },
      repoPath: repoRoot
    });
    vi.mocked(runGit).mockResolvedValue(' M docs/172014/prd/analysis.md\n?? docs/172014/prd/files/input.txt\n');
    vi.mocked(confirmArtifactGitSync).mockResolvedValue({
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      pushed: true,
      centerResult: {
        versions: [
          { id: 301, filePath: 'docs/172014/prd/analysis.md' },
          { id: 302, filePath: 'docs/172014/prd/files/input.txt' }
        ]
      }
    });
  });

  afterEach(async () => {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('导入旧本地产物时写入项目 Git 仓并回写 Git 版本索引', async () => {
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/prd/files'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/files/input.txt'), '需求截图OCR', 'utf8');

    const plan = await buildBootstrapImportPlan(sourceRoot);
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/ai-delivery/import-sessions') {
        return response({ id: 200 });
      }
      if (pathname === '/api/ai-delivery/import-sessions/200/records') {
        const body = JSON.parse(String(init?.body || '{}'));
        return response({
          results: [
            { sourceKey: 'REQUIREMENT:172014', status: 'IMPORTED', targetType: 'REQUIREMENT', targetId: 100 },
            ...body.artifacts.map((artifact: any, index: number) => ({
              sourceKey: `ARTIFACT:${artifact.requirementId}:${artifact.logicalPath}:${artifact.sha256}`,
              status: 'IMPORTED',
              targetType: 'ARTIFACT',
              targetId: 500 + index,
              artifactId: 500 + index
            }))
          ]
        });
      }
      if (pathname === '/api/ai-delivery/import-sessions/200/complete') {
        return response({ id: 200, status: 'COMPLETED' });
      }
      return response({}, false);
    }) as unknown as typeof fetch;

    const result = await importBootstrapPlan(plan, {
      centerBaseUrl: 'https://center.example.com',
      userId: 1,
      projectId: 10,
      clientSessionId: 11,
      workspaceRoot: sourceRoot,
      fetchImpl
    });

    expect(await fs.readFile(path.join(repoRoot, 'docs/172014/prd/analysis.md'), 'utf8')).toBe('# PRD');
    expect(await fs.readFile(path.join(repoRoot, 'docs/172014/prd/files/input.txt'), 'utf8')).toBe('需求截图OCR');
    expect(confirmArtifactGitSync).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: '10', clientSessionId: '11' }),
      expect.objectContaining({ id: 100, requirementId: '172014' }),
      expect.objectContaining({
        stage: 'PRD',
        syncType: 'BOOTSTRAP',
        requirementPk: 100,
        files: ['docs/172014/prd/analysis.md', 'docs/172014/prd/files/input.txt']
      })
    );
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('/artifact-upload-sessions'), expect.anything());
    expect(result.importedArtifacts).toBe(2);
    expect(result.syncedCommits).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
  });

  it('初始化导入排除 reports 下的运行日志但保留普通报告', async () => {
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/prd'), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/reports'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/reports/implementation-report.md'), '# implementation', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/reports/run-20260610085925-588899.log'), 'runtime log', 'utf8');
    vi.mocked(runGit).mockResolvedValue(
      [
        '?? docs/172014/prd/analysis.md',
        '?? docs/172014/reports/implementation-report.md',
        '?? docs/172014/reports/run-20260610085925-588899.log'
      ].join('\n')
    );
    const plan = await buildBootstrapImportPlan(sourceRoot);

    await importBootstrapPlan(plan, {
      centerBaseUrl: 'https://center.example.com',
      userId: 1,
      projectId: 10,
      clientSessionId: 11,
      workspaceRoot: sourceRoot,
      fetchImpl: importFetch() as unknown as typeof fetch
    });

    expect(await fs.readFile(path.join(repoRoot, 'docs/172014/reports/implementation-report.md'), 'utf8')).toBe('# implementation');
    await expect(fs.stat(path.join(repoRoot, 'docs/172014/reports/run-20260610085925-588899.log'))).rejects.toThrow();
    const syncedFiles = vi.mocked(confirmArtifactGitSync).mock.calls.flatMap((call) => call[2].files);
    expect(syncedFiles).toContain('docs/172014/reports/implementation-report.md');
    expect(syncedFiles).not.toContain('docs/172014/reports/run-20260610085925-588899.log');
  });

  it('dry-run 只写本机 manifest，不调用中心和 Git 同步', async () => {
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/prd'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    const plan = await buildBootstrapImportPlan(sourceRoot);
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await importBootstrapPlan(plan, {
      centerBaseUrl: 'https://center.example.com',
      userId: 1,
      projectId: 10,
      clientSessionId: 11,
      workspaceRoot: sourceRoot,
      dryRun: true,
      fetchImpl
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(syncProjectRepository).not.toHaveBeenCalled();
    expect(result.importedArtifacts).toBe(0);
    expect(await fs.readFile(path.join(sourceRoot, '.ai-delivery/import-manifest.json'), 'utf8')).toContain(plan.manifestSha256);
  });

  it('扫描计划会把敏感补充材料标记为冲突而不是导入', async () => {
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/prd'), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/technical-design/file'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/technical-design/file/token.txt'), 'secret', 'utf8');

    const plan = await buildBootstrapImportPlan(sourceRoot);

    expect(plan.conflicts).toContain('不受控产物路径: docs/172014/technical-design/file/token.txt');
    expect(plan.requirements[0].artifacts.map((artifact) => artifact.logicalPath)).not.toContain('docs/172014/technical-design/file/token.txt');
  });

  it('Git 仓中没有变更时按重复产物处理，不再次提交同步', async () => {
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/prd'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    vi.mocked(runGit).mockResolvedValue('');
    const plan = await buildBootstrapImportPlan(sourceRoot);

    const result = await importBootstrapPlan(plan, {
      centerBaseUrl: 'https://center.example.com',
      userId: 1,
      projectId: 10,
      clientSessionId: 11,
      workspaceRoot: sourceRoot,
      fetchImpl: importFetch() as unknown as typeof fetch
    });

    expect(confirmArtifactGitSync).not.toHaveBeenCalled();
    expect(result.duplicatedArtifacts).toBe(1);
  });

  it('Git 同步失败时记录失败产物并继续完成导入会话', async () => {
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/prd'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    vi.mocked(confirmArtifactGitSync).mockRejectedValue(new Error('push failed'));
    const plan = await buildBootstrapImportPlan(sourceRoot);

    const result = await importBootstrapPlan(plan, {
      centerBaseUrl: 'https://center.example.com',
      userId: 1,
      projectId: 10,
      clientSessionId: 11,
      workspaceRoot: sourceRoot,
      fetchImpl: importFetch() as unknown as typeof fetch
    });

    expect(result.failedArtifacts).toBe(1);
    expect(await fs.readFile(path.join(sourceRoot, '.ai-delivery/import-manifest.json'), 'utf8')).toContain('push failed');
  });

  it('缺少 clientSessionId 时阻断导入，避免无法定位本机交付工作区', async () => {
    await fs.mkdir(path.join(sourceRoot, 'docs/172014/prd'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    const plan = await buildBootstrapImportPlan(sourceRoot);

    await expect(
      importBootstrapPlan(plan, {
        centerBaseUrl: 'https://center.example.com',
        userId: 1,
        projectId: 10,
        workspaceRoot: sourceRoot,
        fetchImpl: importFetch() as unknown as typeof fetch
      })
    ).rejects.toThrow('缺少 clientSessionId');
  });
});

function response(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => (ok ? { success: true, data } : { success: false, message: 'failed' })
  };
}

function importFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/api/ai-delivery/import-sessions') {
      return response({ id: 200 });
    }
    if (pathname === '/api/ai-delivery/import-sessions/200/records') {
      const body = JSON.parse(String(init?.body || '{}'));
      return response({
        results: [
          ...body.requirements.map((requirement: any) => ({
            sourceKey: `REQUIREMENT:${requirement.requirementId}`,
            status: 'IMPORTED',
            targetType: 'REQUIREMENT',
            targetId: 100
          })),
          ...body.artifacts.map((artifact: any, index: number) => ({
            sourceKey: `ARTIFACT:${artifact.requirementId}:${artifact.logicalPath}:${artifact.sha256}`,
            status: 'IMPORTED',
            targetType: 'ARTIFACT',
            targetId: 500 + index,
            artifactId: 500 + index
          }))
        ]
      });
    }
    if (pathname === '/api/ai-delivery/import-sessions/200/complete') {
      return response({ id: 200, status: 'COMPLETED' });
    }
    return response({}, false);
  });
}
