import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { buildCenterImportPlan, importPlanToCenter } from '../../server/services/center-importer';

let root = '';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
    requirementType: 'REQUIREMENT',
    branchName: 'feature/opp-172014',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [
      {
        id: 'run-1',
        requirementId: '172014',
        actionType: 'PRD_ANALYZE',
        status: 'SUCCEEDED',
        startedAt: now,
        params: {}
      }
    ],
    reviews: [
      {
        id: 'review-1',
        stage: 'PRD',
        decision: 'APPROVED',
        comment: '',
        actor: '1',
        createdAt: now
      }
    ],
    issues: [
      {
        id: 'issue-1',
        stage: 'CODE_REVIEW',
        severity: 'BLOCKER',
        status: 'OPEN',
        title: '阻断问题'
      }
    ]
  };
}

describe('center-importer', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'center-importer-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('扫描旧工作区产物生成导入计划并保留 workflow 字段', async () => {
    await fs.mkdir(path.join(root, 'docs/172014/prd'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs/172014/prd/analysis.md'), '# PRD', 'utf8');
    await fs.mkdir(path.join(root, 'openspec/changes/req-172014'), { recursive: true });
    await fs.writeFile(path.join(root, 'openspec/changes/req-172014/proposal.md'), '# Proposal', 'utf8');

    const plan = await buildCenterImportPlan(root, [workflow()]);

    expect(plan.requirements).toHaveLength(1);
    expect(plan.requirements[0].runs).toHaveLength(1);
    expect(plan.requirements[0].reviews).toHaveLength(1);
    expect(plan.requirements[0].issues).toHaveLength(1);
    expect(plan.requirements[0].artifacts.map((item) => item.logicalPath)).toContain('docs/172014/prd/analysis.md');
    expect(new Set(plan.requirements[0].artifacts.map((item) => item.logicalPath)).size).toBe(plan.requirements[0].artifacts.length);
    expect(plan.skippedArtifacts.length).toBeGreaterThan(0);
  });

  it('COS 上传失败时停止导入并抛出错误', async () => {
    const filePath = path.join(root, 'analysis.md');
    await fs.writeFile(filePath, '# PRD', 'utf8');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: 100 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: 200 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { uploadSessionId: 300, uploadUrl: 'https://cos.example/upload' } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    await expect(
      importPlanToCenter(
        {
          skippedArtifacts: [],
          requirements: [
            {
              ...workflow(),
              artifacts: [
                {
                  logicalPath: 'docs/172014/prd/analysis.md',
                  label: 'PRD',
                  kind: 'markdown',
                  stage: 'PRD',
                  sha256: 'hash',
                  size: 5,
                  contentType: 'text/markdown',
                  absolutePath: filePath
                }
              ]
            }
          ]
        },
        {
          centerBaseUrl: 'https://center.example.com',
          userId: 1,
          projectId: 10,
          fetchImpl: fetchImpl as unknown as typeof fetch
        }
      )
    ).rejects.toThrow('COS 上传失败');
  });
});
