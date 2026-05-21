import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { executeAction, validateActionInput } from '../../server/services/action-adapters';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
    branchName: 'feature/opp-172014',
    sources: ['https://example.feishu.cn/docx/xxx'],
    currentStage: 'PRD',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('action-adapters', () => {
  it('拒绝工作区外路径参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    expect(() =>
      validateActionInput(root, {
        actionType: 'DESIGN_GENERATE',
        params: { documentPath: '/etc/passwd' }
      })
    ).toThrow('路径不在工作区内');
  });

  it('技能动作在无 Agent Bridge 时生成标准调用文本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), { actionType: 'PRD_ANALYZE', params: {} });
    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.commandText).toContain('/prd id=172014');
  });
});
