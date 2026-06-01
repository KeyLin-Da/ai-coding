import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncCodingSkills } from '../../server/services/skill-sync';

describe('skill-sync', () => {
  let tempDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-skill-'));
    skillsDir = path.join(tempDir, 'skills');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('skills/ 不存在时静默返回空结果', async () => {
    const result = await syncCodingSkills(tempDir);
    expect(result.synced).toBe(0);
    expect(result.targetDirs).toEqual([]);
  });

  it('正常同步 5 个 coding-* 技能到 4 个 agent 目录', async () => {
    // Create skills with 5 coding-* directories
    const skillNames = ['coding-review', 'coding-prd-analyzer', 'coding-design', 'coding-junit', 'coding-database-query'];
    for (const name of skillNames) {
      const dir = path.join(skillsDir, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'SKILL.md'), `# ${name}`);
    }

    const result = await syncCodingSkills(tempDir);
    
    expect(result.synced).toBe(5);
    expect(result.targetDirs).toHaveLength(4);
    
    // Verify each target directory has all 5 skills
    for (const targetBase of result.targetDirs) {
      for (const name of skillNames) {
        const skillPath = path.join(targetBase, name, 'SKILL.md');
        const content = await fs.readFile(skillPath, 'utf8');
        expect(content).toContain(`# ${name}`);
      }
    }
  });

  it('只同步 coding-* 前缀，不同步其他目录', async () => {
    // Create one coding-* and one non-coding-* directory
    const codingDir = path.join(skillsDir, 'coding-review');
    await fs.mkdir(codingDir, { recursive: true });
    await fs.writeFile(path.join(codingDir, 'SKILL.md'), '# coding-review');
    
    const otherDir = path.join(skillsDir, 'my-custom-skill');
    await fs.mkdir(otherDir, { recursive: true });
    await fs.writeFile(path.join(otherDir, 'SKILL.md'), '# my-custom-skill');

    const result = await syncCodingSkills(tempDir);
    
    expect(result.synced).toBe(1);
    
    // Verify only coding-review was synced
    const targetBase = result.targetDirs[0];
    const codingExists = await fs.access(path.join(targetBase, 'coding-review')).then(() => true).catch(() => false);
    const customExists = await fs.access(path.join(targetBase, 'my-custom-skill')).then(() => true).catch(() => false);
    
    expect(codingExists).toBe(true);
    expect(customExists).toBe(false);
  });

  it('覆盖旧版本技能文件', async () => {
    // Create initial version
    const codingDir = path.join(skillsDir, 'coding-review');
    await fs.mkdir(codingDir, { recursive: true });
    await fs.writeFile(path.join(codingDir, 'SKILL.md'), '# v1');
    
    const targetBase = path.join(tempDir, '.codex', 'skills');
    await fs.mkdir(targetBase, { recursive: true });
    const targetSkillDir = path.join(targetBase, 'coding-review');
    await fs.mkdir(targetSkillDir, { recursive: true });
    await fs.writeFile(path.join(targetSkillDir, 'SKILL.md'), '# old-version');

    // Update source
    await fs.writeFile(path.join(codingDir, 'SKILL.md'), '# v2');

    const result = await syncCodingSkills(tempDir);
    
    expect(result.synced).toBe(1);
    
    const updatedContent = await fs.readFile(path.join(targetSkillDir, 'SKILL.md'), 'utf8');
    expect(updatedContent).toBe('# v2');
  });
});
