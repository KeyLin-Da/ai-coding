import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCodeReviewSummary } from '../../server/services/code-review-parser';

describe('code-review-parser', () => {
  it('从 summary.md 提取未修复阻断问题', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const summary = path.join(root, 'summary.md');
    await fs.writeFile(
      summary,
      `# 汇总报告

### ❌ 严重问题 (1)

| ID | 工程 | 文件 | 问题 | 状态 |
|----|------|------|------|------|
| IS-001 | opp-learn | FunActivityServiceImpl.java | 游标分页跳数据 | ❌ 未修复 |
`
    );
    const issues = await parseCodeReviewSummary(summary);
    expect(issues[0]).toMatchObject({ id: 'IS-001', severity: 'BLOCKER', status: 'OPEN' });
  });
});
