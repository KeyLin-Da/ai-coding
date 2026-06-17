import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRuntimeEnvDefaults,
  apiRuntimeHeaders,
  resolveApiUrl,
  resolveRunnerApiUrl,
  resolveWebSocketUrl,
  setApiRuntimeConfig
} from '../../src/api/runtime';
import {
  defaultDesktopLocalConfig,
  loadDesktopLocalConfig,
  saveDesktopLocalConfig
} from '../../src/services/desktop-local-config';

describe('desktop-local-config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
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
    setApiRuntimeConfig({ centerBaseUrl: 'http://127.0.0.1:8728', runnerBaseUrl: 'http://127.0.0.1:8718', accessToken: '', userId: '', clientSessionId: '', projectId: '' });
  });

  it('默认配置只保存本机运行基础信息，不再维护前端 Provider 命令表', () => {
    vi.stubEnv('VITE_AI_DELIVERY_CENTER_BASE_URL', '');
    vi.stubEnv('VITE_AI_DELIVERY_RUNNER_BASE_URL', '');
    const config = defaultDesktopLocalConfig();

    expect(config.clientSessionId).toBe('');
    expect(config.runnerBaseUrl).toBe('http://127.0.0.1:8718');
    expect(config.workspaceMappings).toEqual([]);
    expect('agentProviders' in config).toBe(false);
  });

  it('默认中心和 Runner 地址可由 env profile 提供', () => {
    vi.stubEnv('VITE_AI_DELIVERY_CENTER_BASE_URL', 'https://env-center.example.com');
    vi.stubEnv('VITE_AI_DELIVERY_RUNNER_BASE_URL', 'http://127.0.0.1:9876');

    expect(apiRuntimeEnvDefaults()).toEqual({
      centerBaseUrl: 'https://env-center.example.com',
      runnerBaseUrl: 'http://127.0.0.1:9876'
    });
    expect(defaultDesktopLocalConfig().centerBaseUrl).toBe('https://env-center.example.com');
    expect(defaultDesktopLocalConfig().runnerBaseUrl).toBe('http://127.0.0.1:9876');
  });

  it('浏览器回退存储读写本地配置且运行地址始终来自 env profile', async () => {
    vi.stubEnv('VITE_AI_DELIVERY_CENTER_BASE_URL', 'https://env-center.example.com');
    vi.stubEnv('VITE_AI_DELIVERY_RUNNER_BASE_URL', 'http://127.0.0.1:9876');
    const config = {
      ...defaultDesktopLocalConfig(),
      centerBaseUrl: 'https://center.example.com',
      runnerBaseUrl: 'http://127.0.0.1:8718',
      userId: '1',
      workspaceMappings: [{ projectId: 'p1', localPath: '/Users/me/work' }]
    };

    await saveDesktopLocalConfig(config);
    const loaded = await loadDesktopLocalConfig();

    expect(loaded.centerBaseUrl).toBe('https://env-center.example.com');
    expect(loaded.runnerBaseUrl).toBe('http://127.0.0.1:9876');
    expect(loaded.workspaceMappings).toEqual([{ projectId: 'p1', localPath: '/Users/me/work' }]);
  });

  it('读取旧 local-mode 配置时丢弃旧运行地址和本地数据模式字段', async () => {
    vi.stubEnv('VITE_AI_DELIVERY_CENTER_BASE_URL', 'https://env-center.example.com');
    vi.stubEnv('VITE_AI_DELIVERY_RUNNER_BASE_URL', 'http://127.0.0.1:9876');
    window.localStorage.setItem(
      'ai-delivery.desktop.local-config',
      JSON.stringify({
        apiMode: 'local',
        localBaseUrl: 'http://127.0.0.1:8718',
        centerBaseUrl: 'https://center.example.com',
        runnerBaseUrl: 'http://127.0.0.1:8718',
        clientSessionId: '11',
        agentProviders: [{ id: 'OPENSPEC', command: 'openspec', enabled: true }]
      })
    );

    const loaded = await loadDesktopLocalConfig();

    expect(loaded.centerBaseUrl).toBe('https://env-center.example.com');
    expect(loaded.runnerBaseUrl).toBe('http://127.0.0.1:9876');
    expect(loaded.clientSessionId).toBe('11');
    expect('apiMode' in loaded).toBe(false);
    expect('localBaseUrl' in loaded).toBe(false);
    expect('agentProviders' in loaded).toBe(false);
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
