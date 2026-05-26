import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOpenSpecTasks, readOpenSpecSummary, updateOpenSpecTaskStatus } from '../../server/services/openspec-summary';

describe('openspec-summary', () => {
  it('解析 tasks.md 的分组、完成数量和任务编号', () => {
    const summary = parseOpenSpecTasks(`## 后台编辑器

- [x] 1.1 完成入口确认
- [ ] 1.2 新增组件列表

## 测试验证

- [ ] 2.1 执行最小测试
`);

    expect(summary.total).toBe(3);
    expect(summary.completed).toBe(1);
    expect(summary.groups[0].title).toBe('后台编辑器');
    expect(summary.groups[0].items[0]).toMatchObject({
      id: '1.1',
      title: '完成入口确认',
      completed: true
    });
    expect(summary.groups[1].items[0]).toMatchObject({
      id: '2.1',
      title: '执行最小测试',
      completed: false
    });
  });

  it('读取 active OpenSpec change 的文档和任务摘要', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-'));
    const changeDir = path.join(root, 'openspec', 'changes', 'req-172014');
    await fs.mkdir(path.join(changeDir, 'specs', 'location-menu'), { recursive: true });
    await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Proposal');
    await fs.writeFile(path.join(changeDir, 'design.md'), '# Design');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '## 开发\n\n- [x] 1.1 已完成\n- [ ] 1.2 待完成\n');
    await fs.writeFile(path.join(changeDir, 'specs', 'location-menu', 'spec.md'), '# Spec');

    const summary = await readOpenSpecSummary(root, 'req-172014', 'req-172014');

    expect(summary.exists).toBe(true);
    expect(summary.archived).toBe(false);
    expect(summary.rootPath).toBe('openspec/changes/req-172014');
    expect(summary.artifacts.map((item) => item.path)).toContain('openspec/changes/req-172014/proposal.md');
    expect(summary.specs[0].path).toBe('openspec/changes/req-172014/specs/location-menu/spec.md');
    expect(summary.tasks.total).toBe(2);
    expect(summary.tasks.completed).toBe(1);
  });

  it('active 不存在时读取最新归档目录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-'));
    const older = path.join(root, 'openspec', 'changes', 'archive', '2026-05-20-req-172014');
    const newer = path.join(root, 'openspec', 'changes', 'archive', '2026-05-25-req-172014');
    await fs.mkdir(path.join(older, 'specs'), { recursive: true });
    await fs.mkdir(path.join(newer, 'specs'), { recursive: true });
    await fs.writeFile(path.join(newer, 'proposal.md'), '# Archived Proposal');
    await fs.writeFile(path.join(newer, 'design.md'), '# Archived Design');
    await fs.writeFile(path.join(newer, 'tasks.md'), '## 收口\n\n- [x] 1.1 已归档\n');

    const summary = await readOpenSpecSummary(root, 'req-172014', 'req-172014');

    expect(summary.exists).toBe(true);
    expect(summary.archived).toBe(true);
    expect(summary.archivePath).toBe('openspec/changes/archive/2026-05-25-req-172014');
    expect(summary.tasks.completed).toBe(1);
  });

  it('按行号和原始任务文本切换 active tasks.md 勾选状态', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-'));
    const changeDir = path.join(root, 'openspec', 'changes', 'req-172014');
    const tasksPath = path.join(changeDir, 'tasks.md');
    await fs.mkdir(path.join(changeDir, 'specs'), { recursive: true });
    await fs.writeFile(tasksPath, '## 开发\n\n- [ ] 1.1 待确认\n- [x] 1.2 已完成\n');

    const summary = await updateOpenSpecTaskStatus(root, 'req-172014', 'req-172014', 3, true, '1.1 待确认');
    const content = await fs.readFile(tasksPath, 'utf8');

    expect(content).toContain('- [x] 1.1 待确认');
    expect(summary.tasks.completed).toBe(2);
  });

  it('任务内容变化时拒绝覆盖', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-'));
    const changeDir = path.join(root, 'openspec', 'changes', 'req-172014');
    await fs.mkdir(path.join(changeDir, 'specs'), { recursive: true });
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '## 开发\n\n- [ ] 1.1 新任务\n');

    await expect(updateOpenSpecTaskStatus(root, 'req-172014', 'req-172014', 3, true, '1.1 旧任务')).rejects.toThrow('任务内容已变化');
  });

  it('归档后的 tasks.md 不允许手动切换', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-'));
    const archiveDir = path.join(root, 'openspec', 'changes', 'archive', '2026-05-25-req-172014');
    await fs.mkdir(path.join(archiveDir, 'specs'), { recursive: true });
    await fs.writeFile(path.join(archiveDir, 'tasks.md'), '## 收口\n\n- [ ] 1.1 归档任务\n');

    await expect(updateOpenSpecTaskStatus(root, 'req-172014', 'req-172014', 3, true, '1.1 归档任务')).rejects.toThrow('已归档');
  });
});
