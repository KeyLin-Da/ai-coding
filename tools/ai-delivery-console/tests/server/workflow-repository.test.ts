import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkflowRepository } from '../../server/services/workflow-repository';

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-'));
}

describe('WorkflowRepository', () => {
  it('创建 workflow 并用 state.json 持久化', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);
    const workflow = await repository.upsert({ requirementId: 'REQ/172014', title: '定位菜单' });

    expect(workflow.requirementId).toBe('REQ_172014');
    const loaded = await repository.load('REQ_172014');
    expect(loaded?.title).toBe('定位菜单');
    expect(await fs.stat(path.join(workspace, 'docs', 'REQ_172014', 'workflow', 'state.json'))).toBeTruthy();
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
});
