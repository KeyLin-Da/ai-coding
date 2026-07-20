import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createEmptyStages, type RequirementWorkflow } from '../../shared/workflow';
import {
  assertProjectsCleanAndPushed,
  calculateAiCodeCompleteness,
  captureRemoteAiCommits,
  calculateSummary
} from '../../server/services/ai-code-completeness';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd });
  return result.stdout.trim();
}

async function commitAll(cwd: string, message: string): Promise<string> {
  await git(cwd, ['add', '.']);
  await git(cwd, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

function workflow(projectPath: string): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: 'AI 完整度',
    requirementType: 'REQUIREMENT',
    branchName: 'main',
    projects: [{ name: path.basename(projectPath), path: projectPath }],
    sources: [],
    currentStage: 'IMPLEMENTATION',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('ai-code-completeness', () => {
  it('按 AI 首轮变更和后续调整计算汇总指标', () => {
    const summary = calculateSummary([
      {
        projectName: 'opp-learn',
        projectPath: 'opp-learn',
        aiAdditions: 8,
        aiDeletions: 2,
        aiChangeLines: 10,
        aiChangedFiles: 4,
        followUpAdditions: 2,
        followUpDeletions: 1,
        followUpChangeLines: 3,
        followUpChangedFiles: 1,
        stableAiFiles: 3
      }
    ]);

    expect(summary.completenessRate).toBeCloseTo(76.923, 2);
    expect(summary.followUpAdjustmentRate).toBe(30);
    expect(summary.aiFileStabilityRate).toBe(75);
  });

  it('基于真实 commit 计算完整度并写入产物', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-completeness-'));
    const remote = path.join(workspace, 'remote.git');
    const projectRoot = path.join(workspace, 'opp-learn');
    await git(workspace, ['init', '--bare', remote]);
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'base\n', 'utf8');
    const baseCommit = await commitAll(projectRoot, 'base');
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'base\nai\n', 'utf8');
    await fs.writeFile(path.join(projectRoot, 'src', 'b.txt'), 'generated\n', 'utf8');
    const aiCommit = await commitAll(projectRoot, 'ai');
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'base\nai\nfix\n', 'utf8');
    const finalCommit = await commitAll(projectRoot, 'final');
    await git(projectRoot, ['branch', '-M', 'main']);
    await git(projectRoot, ['remote', 'add', 'origin', remote]);
    await git(projectRoot, ['push', '-u', 'origin', 'main']);
    await git(projectRoot, ['checkout', '-b', 'local-other', baseCommit]);

    const result = await calculateAiCodeCompleteness(workspace, workflow('opp-learn'), {
      projects: [{ projectPath: 'opp-learn', projectName: 'opp-learn', baseCommit, aiCommit }]
    });

    expect(result.result.status).toBe('CALCULATED');
    expect(result.result.projects[0].branch).toBe('origin/main');
    expect(result.result.projects[0].finalCommit).toBe(finalCommit);
    expect(result.result.summary?.aiChangeLines).toBeGreaterThan(0);
    expect(result.result.summary?.followUpChangeLines).toBeGreaterThan(0);
    await expect(fs.stat(path.join(workspace, 'docs/172014/metrics/ai-code-completeness.json'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(workspace, 'docs/172014/metrics/ai-code-completeness.md'))).resolves.toBeTruthy();
  });

  it('审核门禁要求工作区干净且 HEAD 已推送', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-completeness-gate-'));
    const remote = path.join(workspace, 'remote.git');
    const projectRoot = path.join(workspace, 'opp-api');
    await git(workspace, ['init', '--bare', remote]);
    await fs.mkdir(projectRoot, { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'a.txt'), 'base\n', 'utf8');
    const baseCommit = await commitAll(projectRoot, 'base');
    await git(projectRoot, ['branch', '-M', 'main']);
    await git(projectRoot, ['remote', 'add', 'origin', remote]);
    await git(projectRoot, ['push', '-u', 'origin', 'main']);

    const otherRoot = path.join(workspace, 'other');
    await git(workspace, ['clone', remote, otherRoot]);
    await fs.writeFile(path.join(otherRoot, 'a.txt'), 'base\nremote\n', 'utf8');
    const remoteCommit = await commitAll(otherRoot, 'remote-update');
    await git(otherRoot, ['push', 'origin', 'main']);

    const captures = await assertProjectsCleanAndPushed(workspace, [{ name: 'opp-api', path: 'opp-api' }], 'main');
    expect(captures).toHaveLength(1);
    expect(captures[0].branch).toBe('origin/main');
    expect(captures[0].aiCommit).toBe(remoteCommit);

    const capturedState = await captureRemoteAiCommits(
      workspace,
      {
        ...workflow('opp-api'),
        aiCodeCompleteness: {
          status: 'NOT_READY',
          projects: [{ projectName: 'opp-api', projectPath: 'opp-api', baseCommit }]
        }
      }
    );
    expect(capturedState.projects[0].baseCommit).toBe(baseCommit);
    expect(capturedState.projects[0].aiCommit).toBe(remoteCommit);

    await fs.writeFile(path.join(projectRoot, 'a.txt'), 'dirty\n', 'utf8');
    await expect(assertProjectsCleanAndPushed(workspace, [{ name: 'opp-api', path: 'opp-api' }], 'main')).rejects.toThrow('未提交');

    await commitAll(projectRoot, 'local-change');
    await expect(assertProjectsCleanAndPushed(workspace, [{ name: 'opp-api', path: 'opp-api' }], 'main')).rejects.toThrow('未推送');
  });
});
