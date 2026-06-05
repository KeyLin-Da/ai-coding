import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { deleteTechDesignQuestionRecord } from '../../server/services/tech-design-questions';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
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
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: now,
        params: {
          question: '为什么需要缓存？',
          outputPath: 'docs/172014/technical-design/questions.md'
        }
      },
      {
        id: 'run-2',
        requirementId: '172014',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: now,
        params: {
          question: '页面导航权限如何处理？',
          outputPath: 'docs/172014/technical-design/questions/20260604-174500-question.md'
        }
      }
    ],
    reviews: [],
    issues: []
  };
}

describe('tech-design-questions service', () => {
  it('删除旧版 questions.md 中的单条答疑并移除对应运行记录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-question-'));
    const questionPath = path.join(root, 'docs', '172014', 'technical-design', 'questions.md');
    await fs.mkdir(path.dirname(questionPath), { recursive: true });
    await fs.writeFile(
      questionPath,
      `# 技术方案答疑记录

## 2026-06-04 17:30:00 / 172014

**问题：**
为什么需要缓存？

**回答：**
因为存在重复查询。

## 2026-06-04 17:45:00 / 172014

**问题：**
页面导航权限如何处理？

**回答：**
沿用现有权限模型。
`,
      'utf8'
    );

    const nextWorkflow = await deleteTechDesignQuestionRecord(root, workflow(), {
      runId: 'run-1',
      sourcePath: 'docs/172014/technical-design/questions.md',
      question: '为什么需要缓存？'
    });
    const content = await fs.readFile(questionPath, 'utf8');

    expect(content).not.toContain('为什么需要缓存？');
    expect(content).toContain('页面导航权限如何处理？');
    expect(nextWorkflow.runs.map((run) => run.id)).toEqual(['run-2']);
  });

  it('删除独立答疑文件并移除同输出路径运行记录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-question-file-'));
    const questionPath = path.join(root, 'docs', '172014', 'technical-design', 'questions', '20260604-174500-question.md');
    await fs.mkdir(path.dirname(questionPath), { recursive: true });
    await fs.writeFile(questionPath, '# 技术方案答疑记录\n', 'utf8');

    const nextWorkflow = await deleteTechDesignQuestionRecord(root, workflow(), {
      sourcePath: 'docs/172014/technical-design/questions/20260604-174500-question.md',
      question: '页面导航权限如何处理？'
    });

    await expect(fs.stat(questionPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(nextWorkflow.runs.map((run) => run.id)).toEqual(['run-1']);
  });
});
