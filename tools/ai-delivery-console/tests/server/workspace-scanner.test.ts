import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRequirementArtifacts } from '../../server/services/workspace-scanner';

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-scan-'));
  await fs.mkdir(path.join(root, 'docs', '172014', 'prd'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', '172014', 'technical-design', 'file'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', '172014', 'junit', 'req-172014'), { recursive: true });
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'req-172014'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', '172014', 'code-review', 'commit'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', '172014', 'code-review', 'staged'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', 'code_review', 'code_review_feature_opp_172014'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', '172014', 'prd', 'analysis.md'), '# PRD');
  await fs.writeFile(path.join(root, 'docs', '172014', 'technical-design', 'design_review.md'), '# Design');
  await fs.writeFile(path.join(root, 'docs', '172014', 'technical-design', 'file', 'old-design.md'), '# Old Design');
  await fs.writeFile(path.join(root, 'docs', '172014', 'junit', 'req-172014', 'report.md'), '# JUnit');
  await fs.writeFile(path.join(root, 'docs', '172014', 'code-review', 'summary.md'), '# Review Index');
  await fs.writeFile(path.join(root, 'docs', '172014', 'code-review', 'commit', 'summary.md'), '# Commit Review');
  await fs.writeFile(path.join(root, 'docs', '172014', 'code-review', 'staged', 'summary.md'), '# Staged Review');
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
        'docs/172014/technical-design/file/old-design.md',
        'openspec/changes/req-172014',
        'docs/172014/junit/req-172014/report.md',
        'docs/172014/code-review/summary.md',
        'docs/172014/code-review/commit/summary.md',
        'docs/172014/code-review/staged/summary.md',
        'docs/code_review/code_review_feature_opp_172014/summary.md'
      ])
    );
  });

  it('不再展示旧式 PRD 产物路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-legacy-prd-'));
    await fs.mkdir(path.join(root, 'docs', 'prd', '172014'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'prd', '172014', 'analysis.md'), '# Legacy PRD');

    const artifacts = await scanRequirementArtifacts(root, '172014', 'feature/opp-172014');
    const legacyPrd = artifacts.find((item) => item.id === 'prd-analysis-legacy');

    expect(legacyPrd).toBeUndefined();
    expect(artifacts.some((item) => item.label === 'PRD 分析文档（旧路径）')).toBe(false);
  });

  it('缺陷未生成 PRD 时不返回 PRD 分析文档占位', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-defect-scan-'));
    const artifacts = await scanRequirementArtifacts(root, '172014', 'bugfix/opp#172014', undefined, 'DEFECT');

    expect(artifacts.some((item) => item.id === 'prd-analysis')).toBe(false);
    expect(artifacts.some((item) => item.path === 'docs/172014/prd/analysis.md')).toBe(false);
    expect(artifacts.some((item) => item.id === 'technical-design')).toBe(true);
  });

  it('缺陷历史 PRD 文件已存在时只索引文件且不删除', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-defect-prd-'));
    await fs.mkdir(path.join(root, 'docs', '172014', 'prd'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', '172014', 'prd', 'analysis.md'), '# Historical PRD');

    const artifacts = await scanRequirementArtifacts(root, '172014', 'bugfix/opp#172014', undefined, 'DEFECT');
    const prd = artifacts.find((item) => item.id === 'prd-analysis');

    expect(prd?.exists).toBe(true);
    expect(await fs.readFile(path.join(root, 'docs', '172014', 'prd', 'analysis.md'), 'utf8')).toBe('# Historical PRD');
  });
});
