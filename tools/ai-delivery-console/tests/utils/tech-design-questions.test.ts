import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../../shared/workflow';
import { buildTechDesignQuestionItems, parseTechDesignQuestionRecords } from '../../src/utils/tech-design-questions';

describe('parseTechDesignQuestionRecords', () => {
  it('从技术方案答疑 Markdown 中提取每次提问的问题', () => {
    const records = parseTechDesignQuestionRecords(
      `# 技术方案答疑记录

## 2026-06-04 17:30:00 / 172014

**问题：**
为什么需要缓存？

**输入上下文：**
- 文档：docs/172014/prd/analysis.md

**回答：**
## 处理结论

- 因为存在重复查询。

## 2026-06-04 17:45:00 / 172014

**问题：**
页面导航权限如何处理？

**输入上下文：**
- 文档：docs/172014/technical-design/design_review.md

**回答：**
沿用现有权限模型。
`);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      time: '2026-06-04 17:30:00',
      requirementId: '172014',
      question: '为什么需要缓存？',
      summary: '为什么需要缓存？',
      answer: '## 处理结论\n\n- 因为存在重复查询。'
    });
    expect(records[1]).toMatchObject({
      time: '2026-06-04 17:45:00',
      question: '页面导航权限如何处理？'
    });
  });

  it('合并运行记录和答疑记录，生成带状态的问题列表', () => {
    const records = parseTechDesignQuestionRecords(`# 技术方案答疑记录

## 2026-06-04 17:30:00 / 172014

**问题：**
为什么需要缓存？

**输入上下文：**
- 文档：docs/172014/prd/analysis.md

**回答：**
因为存在重复查询。

**依据：**
- 技术方案缓存策略

**后续建议：**
- 继续观察缓存命中率
`,
      'docs/172014/technical-design/questions.md'
    );
    const runs: RunRecord[] = [
      {
        id: 'run-2',
        requirementId: '172014',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'RUNNING',
        startedAt: '2026-06-04T17:45:00.000Z',
        params: {
          question: '页面导航权限如何处理？'
        }
      },
      {
        id: 'run-1',
        requirementId: '172014',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: '2026-06-04T17:30:00.000Z',
        params: {
          question: '为什么需要缓存？'
        }
      }
    ];

    const items = buildTechDesignQuestionItems(records, runs);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'run-1',
      status: 'ANSWERED',
      answer: expect.objectContaining({
        answer: '因为存在重复查询。',
        evidence: '- 技术方案缓存策略',
        suggestions: '- 继续观察缓存命中率'
      })
    });
    expect(items[1]).toMatchObject({
      id: 'run-2',
      status: 'RUNNING',
      runId: 'run-2'
    });
  });

  it('按输出路径合并运行记录和 Markdown 记录，避免重复展示同一问题', () => {
    const records = parseTechDesignQuestionRecords(
      `# 技术方案答疑记录

## 2026-06-04 17:57:34 / 170094

**问题：**
我觉得opp-diy不改动也没有影响吧

**回答：**
不建议排除后端兜底。`,
      'docs/170094/technical-design/questions.md'
    );
    const runs: RunRecord[] = [
      {
        id: 'run-question',
        requirementId: '170094',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: '2026-06-04T09:52:11.000Z',
        params: {
          question: '我觉得opp-diy不改动也没有影响吧',
          outputPath: 'docs/170094/technical-design/questions.md'
        }
      }
    ];

    const items = buildTechDesignQuestionItems(records, runs);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'run-question',
      status: 'ANSWERED',
      sourcePath: 'docs/170094/technical-design/questions.md'
    });
  });
});
