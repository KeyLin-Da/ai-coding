import { beforeEach, describe, expect, it } from 'vitest';
import { apiRuntimeHeaders, resolveApiUrl, resolveRunnerApiUrl, resolveWebSocketUrl, setApiRuntimeConfig } from '../../src/api/runtime';
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
    setApiRuntimeConfig({ centerBaseUrl: 'http://127.0.0.1:8728', accessToken: '', userId: '', clientSessionId: '', projectId: '' });
  });

  it('默认配置只保存本机映射和命令摘要', () => {
    const config = defaultDesktopLocalConfig();

    expect(config.clientSessionId).toBe('');
    expect(config.runnerBaseUrl).toBe('http://127.0.0.1:8718');
    expect(config.agentProviders.map((item) => item.command)).toEqual(['codex', 'openspec', 'git', 'node']);
    expect(config.workspaceMappings).toEqual([]);
  });

  it('浏览器回退存储读写本地配置', async () => {
    const config = {
      ...defaultDesktopLocalConfig(),
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
      centerBaseUrl: 'https://center.example.com/',
      userId: '7',
      clientSessionId: '9',
      projectId: '2',
      runnerBaseUrl: 'http://127.0.0.1:8718'
    });

    expect(resolveApiUrl('/api/ai-delivery/jobs')).toBe('https://center.example.com/api/ai-delivery/jobs');
    expect(resolveRunnerApiUrl('/api/ai-delivery/git-credentials/generate-local')).toBe('http://127.0.0.1:8718/api/ai-delivery/git-credentials/generate-local');
    expect(resolveWebSocketUrl('/api/ai-delivery/ws')).toBe('wss://center.example.com/api/ai-delivery/ws');
    expect(apiRuntimeHeaders()).toEqual({
      'X-User-Id': '7',
      'X-Project-Id': '2',
      'X-Client-Session-Id': '9',
      'X-Center-Base-Url': 'https://center.example.com/',
      'X-Runner-Base-Url': 'http://127.0.0.1:8718'
    });
  });

  it('桌面 file 协议下 API runtime 仍指向中心服务', () => {
    setApiRuntimeConfig({
      centerBaseUrl: 'http://127.0.0.1:8728',
      userId: '7',
      clientSessionId: '9',
      projectId: '2'
    });

    expect(resolveApiUrl('/api/ai-delivery/requirements')).toBe('http://127.0.0.1:8728/api/ai-delivery/requirements');
    expect(resolveWebSocketUrl('/api/ai-delivery/ws', 'file:')).toBe('ws://127.0.0.1:8728/api/ai-delivery/ws');
  });
});
