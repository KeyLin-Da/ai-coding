import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.vue';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    listMemoryCandidates: vi.fn(),
    syncProjectRepository: vi.fn()
  }
}));

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

function componentStubs() {
  return {
    ElBadge: {
      props: ['value'],
      template: '<small class="el-badge">{{ value }}</small>'
    },
    ElButton: {
      props: ['title', 'ariaLabel'],
      emits: ['click'],
      template: '<button :title="title" :aria-label="ariaLabel" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ElIcon: {
      template: '<span><slot /></span>'
    },
    ElMenu: {
      props: ['collapse'],
      template: '<nav class="project-menu" :class="{ \'el-menu--collapse\': collapse }"><slot /></nav>'
    },
    ElMenuItem: {
      template: '<div class="menu-item"><slot /></div>'
    },
    ElSubMenu: {
      template: '<div class="sub-menu"><slot name="title" /><slot /></div>'
    },
    RouterView: {
      template: '<section class="route-content" />'
    }
  };
}

async function mountApp() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore(pinia).applySession({
    token: 'token',
    expireAt: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: 1,
      account: 'key.lin',
      displayName: 'Key Lin'
    }
  });
  useProjectStore(pinia).current = {
    id: 10,
    name: '演示项目'
  } as any;
  vi.mocked(apiClient.listMemoryCandidates).mockResolvedValue({
    total: 0,
    items: []
  } as any);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'requirements',
        component: { template: '<div />' }
      }
    ]
  });
  await router.push('/');
  await router.isReady();

  return mount(App, {
    global: {
      plugins: [pinia, router],
      stubs: componentStubs()
    }
  });
}

describe('App 项目导航', () => {
  beforeEach(() => {
    localStorageMock();
    vi.clearAllMocks();
  });

  it('左侧项目菜单支持折叠和恢复', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('.project-nav').classes()).not.toContain('collapsed');
    expect(wrapper.find('.app-main').classes()).not.toContain('project-nav-collapsed');
    expect(wrapper.find('.project-menu').classes()).not.toContain('el-menu--collapse');

    await wrapper.find('.project-nav-toggle').trigger('click');

    expect(wrapper.find('.project-nav').classes()).toContain('collapsed');
    expect(wrapper.find('.app-main').classes()).toContain('project-nav-collapsed');
    expect(wrapper.find('.project-menu').classes()).toContain('el-menu--collapse');
    expect(window.localStorage.getItem('ai-delivery-console:project-nav-collapsed')).toBe('1');

    await wrapper.find('.project-nav-toggle').trigger('click');

    expect(wrapper.find('.project-nav').classes()).not.toContain('collapsed');
    expect(wrapper.find('.app-main').classes()).not.toContain('project-nav-collapsed');
    expect(wrapper.find('.project-menu').classes()).not.toContain('el-menu--collapse');
    expect(window.localStorage.getItem('ai-delivery-console:project-nav-collapsed')).toBe('0');
  });
});
