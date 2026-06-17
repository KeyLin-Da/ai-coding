import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRuntimeHeaders, getApiRuntimeConfig, setApiRuntimeConfig } from '../../src/api/runtime';
import { useAuthStore } from '../../src/stores/auth';
import { useProjectStore } from '../../src/stores/project';
import { useSettingsStore } from '../../src/stores/settings';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
    listMyProjects: vi.fn(),
    selectProject: vi.fn(),
    listWorkspaceMappings: vi.fn()
  }
}));

describe('onboarding stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
    setApiRuntimeConfig({ centerBaseUrl: 'http://127.0.0.1:8728', runnerBaseUrl: 'http://127.0.0.1:8718', accessToken: '', userId: '', clientSessionId: '', projectId: '' });
    vi.clearAllMocks();
  });

  it('登录后保存一天会话并使用 Bearer token', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      token: 'token-1',
      expireAt: new Date(Date.now() + 86_400_000).toISOString(),
      user: {
        id: 7,
        account: 'key.lin',
        displayName: 'Key Lin',
        status: 'ACTIVE'
      }
    });

    await useAuthStore().login('key.lin');

    expect(apiRuntimeHeaders()).toEqual({
      Authorization: 'Bearer token-1',
      'X-Center-Base-Url': 'http://127.0.0.1:8728',
      'X-Runner-Base-Url': 'http://127.0.0.1:8718'
    });
    expect(getApiRuntimeConfig().userId).toBe('7');
  });

  it('选择项目后写入当前 projectId 并加载私有目录', async () => {
    vi.mocked(apiClient.selectProject).mockResolvedValue({
      id: 2,
      name: 'AI Delivery',
      code: 'ai-delivery',
      status: 'ACTIVE',
      role: 'OWNER',
      selected: true
    });
    vi.mocked(apiClient.listWorkspaceMappings).mockResolvedValue([
      {
        id: 1,
        projectId: 2,
        localPath: '/Users/key.lin/work',
        status: 'ACTIVE'
      }
    ]);

    const project = useProjectStore();
    await project.selectProject({
      id: 2,
      name: 'AI Delivery',
      code: 'ai-delivery',
      status: 'ACTIVE',
      role: 'OWNER'
    });

    expect(getApiRuntimeConfig().projectId).toBe('2');
    expect(project.workspaceMappings[0].localPath).toBe('/Users/key.lin/work');
  });

  it('加载本机设置时不覆盖已选择项目的 projectId', async () => {
    vi.mocked(apiClient.selectProject).mockResolvedValue({
      id: 5,
      name: 'OPP',
      code: 'opp',
      status: 'ACTIVE',
      role: 'OWNER',
      selected: true
    });
    vi.mocked(apiClient.listWorkspaceMappings).mockResolvedValue([]);

    const project = useProjectStore();
    await project.selectProject({
      id: 5,
      name: 'OPP',
      code: 'opp',
      status: 'ACTIVE',
      role: 'OWNER'
    });
    expect(getApiRuntimeConfig().projectId).toBe('5');

    window.localStorage.setItem(
      'ai-delivery.desktop.local-config',
      JSON.stringify({
        centerBaseUrl: 'http://127.0.0.1:8728',
        runnerBaseUrl: 'http://127.0.0.1:8718',
        userId: '7',
        clientSessionId: '16',
        projectId: '1'
      })
    );

    await useSettingsStore().load();

    expect(getApiRuntimeConfig().projectId).toBe('5');
  });
});
