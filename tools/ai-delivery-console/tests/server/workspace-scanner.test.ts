import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRequirementArtifacts } from '../../server/services/workspace-scanner';

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-scan-'));
  await fs.mkdir(path.join(root, 'docs', '172014', 'prd'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', '172014', 'technical-design'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', '172014', 'junit', 'req-172014'), { recursive: true });
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'req-172014'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', 'code_review', 'code_review_feature_opp_172014'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', '172014', 'prd', 'analysis.md'), '# PRD');
  await fs.writeFile(path.join(root, 'docs', '172014', 'technical-design', 'design_review.md'), '# Design');
  await fs.writeFile(path.join(root, 'docs', '172014', 'junit', 'req-172014', 'report.md'), '# JUnit');
  await fs.writeFile(path.join(root, 'docs', 'code_review', 'code_review_feature_opp_172014', 'summary.md'), '# Review');
  return root;
}

describe('workspace-scanner', () => {
  it('扫描需求关联的已有产物，不移动历史文件', async () => {
    const root = await makeFixture();
    const artifacts = await scanRequirementArtifacts(root, '172014', 'feature/opp-172014');
    expect(artifacts.filter((item) => item.exists).map((item) => item.path)).toEqual(
      expect.arrayContaining([
        'docs/172014/prd/analysis.md',
        'docs/172014/technical-design/design_review.md',
        'openspec/changes/req-172014',
        'docs/172014/junit/req-172014/report.md',
        'docs/code_review/code_review_feature_opp_172014/summary.md'
      ])
    );
  });

  it('兼容旧式 PRD 产物路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-legacy-prd-'));
    await fs.mkdir(path.join(root, 'docs', 'prd', '172014'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'prd', '172014', 'analysis.md'), '# Legacy PRD');

    const artifacts = await scanRequirementArtifacts(root, '172014', 'feature/opp-172014');
    const legacyPrd = artifacts.find((item) => item.id === 'prd-analysis-legacy');

    expect(legacyPrd).toMatchObject({
      stage: 'PRD',
      label: 'PRD 分析文档（旧路径）',
      path: 'docs/prd/172014/analysis.md',
      kind: 'markdown',
      exists: true
    });
  });
});
