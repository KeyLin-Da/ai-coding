import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, validateSettings } from '../../server/services/project-settings';

describe('project-settings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-settings-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('配置文件不存在时返回空路径列表', async () => {
    const settings = await loadSettings(tempDir);
    expect(settings).toEqual({ projectPaths: [] });
  });

  it('保存并读取配置成功', async () => {
    const input = { projectPaths: ['/Users/dev/projects', '/Users/dev/workspaces'] };
    await saveSettings(tempDir, input);
    const loaded = await loadSettings(tempDir);
    expect(loaded).toEqual(input);
  });

  it('validateSettings 校验绝对路径', async () => {
    expect(validateSettings({ projectPaths: ['/valid/path'] })).toBeUndefined();
    expect(validateSettings({ projectPaths: ['relative/path'] })).toBe('路径必须为绝对路径：relative/path');
    expect(validateSettings({ projectPaths: [''] })).toBe('路径不能为空');
    expect(validateSettings({ projectPaths: [123 as any] })).toBe('路径不能为空');
    expect(validateSettings({ projectPaths: [] })).toBe('至少配置一个工程父目录');
    expect(validateSettings({ projectPaths: 'not-array' as any })).toBe('projectPaths 必须是数组');
  });
});
