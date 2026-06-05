import { beforeEach, describe, expect, it } from 'vitest';
import { apiRuntimeHeaders, resolveApiUrl, setApiRuntimeConfig } from '../../src/api/runtime';
import {
  defaultDesktopLocalConfig,
  loadDesktopLocalConfig,
  saveDesktopLocalConfig
} from '../../src/services/desktop-local-config';

describe('desktop-local-config', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) || null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear()
      }
    });
    window.localStorage.clear();
    delete window.aiDeliveryDesktop;
    setApiRuntimeConfig({ mode: 'local', centerBaseUrl: 'http://127.0.0.1:8728', userId: '' });
  });

  it('默认配置只保存本机映射和命令摘要', () => {
    const config = defaultDesktopLocalConfig();

    expect(config.apiMode).toBe('local');
    expect(config.agentProviders.map((item) => item.command)).toEqual(['codex', 'openspec', 'git', 'node']);
    expect(config.workspaceMappings).toEqual([]);
  });

  it('浏览器回退存储读写本地配置', async () => {
    const config = {
      ...defaultDesktopLocalConfig(),
      apiMode: 'remote' as const,
      centerBaseUrl: 'https://center.example.com',
      userId: '1',
      workspaceMappings: [{ projectId: 'p1', localPath: '/Users/me/work' }]
    };

    await saveDesktopLocalConfig(config);
    const loaded = await loadDesktopLocalConfig();

    expect(loaded.centerBaseUrl).toBe('https://center.example.com');
    expect(loaded.workspaceMappings).toEqual([{ projectId: 'p1', localPath: '/Users/me/work' }]);
  });

  it('远程 API runtime 拼接中心服务 URL 并携带用户头', () => {
    setApiRuntimeConfig({
      mode: 'remote',
      centerBaseUrl: 'https://center.example.com/',
      userId: '7'
    });

    expect(resolveApiUrl('/api/ai-delivery/jobs')).toBe('https://center.example.com/api/ai-delivery/jobs');
    expect(apiRuntimeHeaders()).toEqual({ 'X-User-Id': '7' });
  });

  it('桌面 file 协议下本地 API runtime 指向本机 Runner', () => {
    setApiRuntimeConfig({
      mode: 'local',
      localBaseUrl: 'http://127.0.0.1:8718'
    });

    expect(resolveApiUrl('/api/ai-delivery/requirements', 'file:')).toBe('http://127.0.0.1:8718/api/ai-delivery/requirements');
    expect(resolveApiUrl('/api/ai-delivery/requirements', 'http:')).toBe('/api/ai-delivery/requirements');
  });
});
