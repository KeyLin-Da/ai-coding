import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import router from '../../src/router';
import { useAuthStore } from '../../src/stores/auth';
import { useProjectStore } from '../../src/stores/project';
import { setApiRuntimeConfig } from '../../src/api/runtime';

function localStorageMock() {
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
}

describe('router guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock();
    setApiRuntimeConfig({ centerBaseUrl: 'http://127.0.0.1:8728', accessToken: '', userId: '', clientSessionId: '', projectId: '' });
  });

  it('按登录态和当前项目路由到对应入口', async () => {
    await router.push('/');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('login');

    const auth = useAuthStore();
    auth.applySession({
      token: 'token-1',
      expireAt: new Date(Date.now() + 86_400_000).toISOString(),
      user: {
        id: 7,
        account: 'key.lin',
        displayName: 'Key Lin',
        status: 'ACTIVE'
      }
    });
    await router.push('/requirements/172014');
    expect(router.currentRoute.value.name).toBe('projects');

    const project = useProjectStore();
    project.current = {
      id: 2,
      name: 'AI Delivery',
      code: 'ai-delivery',
      status: 'ACTIVE',
      role: 'OWNER'
    };
    project.applyRuntime();
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('project-repository-required');

    project.current = {
      ...project.current,
      repository: {
        provider: 'GITLAB',
        repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
        defaultBranch: 'master'
      }
    };
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('requirements');
  });
});
