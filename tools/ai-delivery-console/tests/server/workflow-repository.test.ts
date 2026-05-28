import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkflowRepository } from '../../server/services/workflow-repository';
import { readProjectHistory } from '../../server/services/project-history';

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-'));
}

describe('WorkflowRepository', () => {
  it('创建 workflow 并用 state.json 持久化', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);
    const workflow = await repository.upsert({ requirementId: 'REQ/172014', title: '定位菜单', requirementType: 'REQUIREMENT' });

    expect(workflow.requirementId).toBe('REQ_172014');
    expect(workflow.requirementType).toBe('REQUIREMENT');
    expect(workflow.branchName).toBe('feature/opp#REQ_172014');
    const loaded = await repository.load('REQ_172014');
    expect(loaded?.title).toBe('定位菜单');
    expect(loaded?.implementationSteps?.START_CHANGE.status).toBe('DRAFT');
    expect(loaded?.implementationSteps?.ARTIFACT_REVIEW.status).toBe('NOT_STARTED');
    expect(await fs.stat(path.join(workspace, 'docs', 'REQ_172014', 'workflow', 'state.json'))).toBeTruthy();
  });

  it('缺陷类型默认生成 bugfix 分支名', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);
    const workflow = await repository.upsert({ requirementId: '172014', title: '定位菜单缺陷', requirementType: 'DEFECT' });

    expect(workflow.requirementType).toBe('DEFECT');
    expect(workflow.branchName).toBe('bugfix/opp#172014');
  });

  it('更新已有 workflow 时保留运行记录', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);
    const workflow = await repository.upsert({ requirementId: '172014', title: '旧标题' });
    workflow.runs.push({
      id: 'run-1',
      requirementId: '172014',
      actionType: 'REFRESH_ARTIFACTS',
      status: 'SUCCEEDED',
      startedAt: new Date().toISOString(),
      params: {}
    });
    await repository.save(workflow);
    const updated = await repository.upsert({ requirementId: '172014', title: '新标题' });
    expect(updated.runs).toHaveLength(1);
    expect(updated.title).toBe('新标题');
  });

  it('保存涉及工程并写入输入历史', async () => {
    const workspace = await tmpWorkspace();
    await fs.mkdir(path.join(workspace, 'opp-gateway'), { recursive: true });
    const repository = new WorkflowRepository(workspace);
    const workflow = await repository.upsert({
      requirementId: '172014',
      title: '定位菜单',
      projects: [{ name: 'opp-gateway', path: 'opp-gateway' }]
    });

    expect(workflow.projects).toEqual([{ name: 'opp-gateway', path: 'opp-gateway' }]);
    const history = JSON.parse(await fs.readFile(path.join(workspace, 'docs', '.ai-delivery-console', 'project-history.json'), 'utf8'));
    expect(history.projects[0].path).toBe('opp-gateway');
  });

  it('读取工程历史时快照工作区顶层 Git 工程', async () => {
    const workspace = await tmpWorkspace();
    await fs.mkdir(path.join(workspace, 'opp-gateway', '.git'), { recursive: true });
    await fs.mkdir(path.join(workspace, 'opp-learn', '.git'), { recursive: true });
    await fs.mkdir(path.join(workspace, 'docs'), { recursive: true });

    const history = await readProjectHistory(workspace);

    expect(history.map((project) => project.path)).toEqual(['opp-gateway', 'opp-learn']);
    const stored = JSON.parse(await fs.readFile(path.join(workspace, 'docs', '.ai-delivery-console', 'project-history.json'), 'utf8'));
    expect(stored.projects.map((project: { path: string }) => project.path)).toEqual(['opp-gateway', 'opp-learn']);
  });

  it('拒绝工作区外的涉及工程', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);

    await expect(
      repository.upsert({
        requirementId: '172014',
        title: '定位菜单',
        projects: [{ name: 'tmp', path: '../tmp' }]
      })
    ).rejects.toThrow('路径不在工作区内');
  });

  it('持久化并清洗 PRD 澄清描述', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);
    const workflow = await repository.upsert({
      requirementId: '172014',
      title: '定位菜单',
      prdClarification: '  仅覆盖后台端\n\t暂不包含用户端  '
    });
    expect(workflow.prdClarification).toBe('仅覆盖后台端 暂不包含用户端');

    const loaded = await repository.load('172014');
    expect(loaded?.prdClarification).toBe('仅覆盖后台端 暂不包含用户端');
  });

  it('更新 workflow 时可保留、截断和清空 PRD 澄清描述', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);
    await repository.upsert({
      requirementId: '172014',
      title: '定位菜单',
      prdClarification: '初始澄清'
    });

    const preserved = await repository.upsert({ requirementId: '172014', title: '新标题' });
    expect(preserved.prdClarification).toBe('初始澄清');

    const truncated = await repository.upsert({
      requirementId: '172014',
      prdClarification: 'a'.repeat(520)
    });
    expect(truncated.prdClarification).toHaveLength(500);

    const cleared = await repository.upsert({ requirementId: '172014', prdClarification: '   ' });
    expect(cleared.prdClarification).toBeUndefined();
  });
});
