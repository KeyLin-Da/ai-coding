import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertProjectPathsConfigured, loadPrivateProjectSettings, loadSettings, saveSettings, validateSettings } from '../../server/services/project-settings';

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

  it('从中心按当前登录用户和项目读取私有工程目录', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { localPath: '/Users/me/work', status: 'ACTIVE' },
          { localPath: '/Users/me/work', status: 'ACTIVE' },
          { localPath: '/Users/me/disabled', status: 'DISABLED' }
        ]
      })
    });

    const settings = await loadPrivateProjectSettings({
      centerBaseUrl: 'http://center.example.com/',
      projectId: 2,
      accessToken: 'token-1',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(settings).toEqual({ projectPaths: ['/Users/me/work'] });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://center.example.com/api/ai-delivery/projects/2/workspace-mappings',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer token-1'
        }
      })
    );
  });

  it('缺少项目或登录态时不读取私有工程目录', async () => {
    await expect(loadPrivateProjectSettings({ accessToken: 'token-1' })).rejects.toThrow('请先选择项目');
    await expect(loadPrivateProjectSettings({ projectId: 2 })).rejects.toThrow('请先登录');
  });

  it('本地工程操作在未配置私有目录时提示个人中心配置', () => {
    expect(() => assertProjectPathsConfigured({ projectPaths: [] })).toThrow('请先在个人中心为当前项目配置工程目录');
  });
});
