import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../../src/views/Settings.vue';
import { apiClient } from '@/api/client';

const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPush
  })
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    updateProfile: vi.fn(),
    logout: vi.fn(),
    listWorkspaceMappings: vi.fn(),
    saveWorkspaceMapping: vi.fn(),
    disableWorkspaceMapping: vi.fn(),
    registerClientSession: vi.fn(),
    getDeliveryWorkspace: vi.fn(),
    saveDeliveryWorkspace: vi.fn(),
    listGitCredentials: vi.fn(),
    generateLocalGitCredential: vi.fn(),
    regenerateLocalGitCredential: vi.fn(),
    refreshProjectRepositoryStatus: vi.fn(),
    cloneProjectRepository: vi.fn(),
    pushProjectRepository: vi.fn(),
    updateProjectSkills: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    }
  };
});

function stubs() {
  return {
    ElButton: {
      props: ['icon', 'loading', 'type'],
      template: '<button :disabled="loading" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ElTabs: {
      props: ['modelValue'],
      template: '<div><slot /></div>'
    },
    ElTabPane: {
      props: ['label', 'name'],
      template: '<section><slot /></section>'
    },
    ElCard: {
      template: '<section><header><slot name="header" /></header><slot /></section>'
    },
    ElForm: {
      template: '<form><slot /></form>'
    },
    ElFormItem: {
      props: ['label'],
      template: '<label><span>{{ label }}</span><slot /></label>'
    },
    ElInput: {
      props: ['modelValue', 'placeholder'],
      emits: ['update:modelValue'],
      template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    },
    ElRadioGroup: {
      template: '<div><slot /></div>'
    },
    ElRadioButton: {
      props: ['label'],
      template: '<button type="button"><slot />{{ label }}</button>'
    },
    ElSelect: {
      props: ['modelValue'],
      template: '<select><slot /></select>'
    },
    ElOption: {
      props: ['label', 'value'],
      template: '<option :value="value">{{ label }}</option>'
    },
    ElTable: {
      props: ['data'],
      template: '<div><slot /></div>'
    },
    ElTableColumn: {
      template: '<div><slot name="default" :row="{}" :$index="0" /></div>'
    },
    ElSwitch: {
      template: '<input type="checkbox" />'
    },
    ElTag: {
      template: '<span><slot /></span>'
    },
    ElAlert: {
      template: '<div />'
    },
    ElEmpty: {
      template: '<div />'
    },
    ElDivider: {
      template: '<hr />'
    },
    ElDescriptions: {
      template: '<dl><slot /></dl>'
    },
    ElDescriptionsItem: {
      props: ['label'],
      template: '<div><dt>{{ label }}</dt><dd><slot /></dd></div>'
    },
    ElIcon: {
      template: '<span><slot /></span>'
    },
    ElSkeleton: {
      template: '<div />'
    }
  };
}

describe('Settings', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routerPush.mockReset();
    vi.mocked(apiClient.getSettings).mockResolvedValue({ projectPaths: ['/Users/me/work'] });
    vi.mocked(apiClient.saveSettings).mockResolvedValue({ projectPaths: ['/Users/me/work'] });
    vi.mocked(apiClient.registerClientSession).mockResolvedValue({ id: 11, clientKey: 'test-client' });
    vi.mocked(apiClient.listWorkspaceMappings).mockResolvedValue([]);
    vi.mocked(apiClient.getDeliveryWorkspace).mockResolvedValue({ id: 1, clientSessionId: 11, localPath: '/Users/me/delivery', status: 'ACTIVE' });
    vi.mocked(apiClient.listGitCredentials).mockResolvedValue([]);
    vi.mocked(apiClient.refreshProjectRepositoryStatus).mockResolvedValue({
      projectId: 2,
      clientSessionId: 11,
      localRepoPath: '/Users/me/delivery/ai-delivery',
      syncStatus: 'READY'
    });
    vi.mocked(apiClient.saveWorkspaceMapping).mockResolvedValue({
      id: 1,
      projectId: 2,
      localPath: '/Users/me/work',
      status: 'ACTIVE'
    });
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
    delete window.aiDeliveryDesktop;
  });

  it('未选择项目时从个人中心返回项目列表', async () => {
    const wrapper = mount(Settings, {
      global: {
        plugins: [createPinia()],
        stubs: stubs()
      }
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text().includes('返回'))?.trigger('click');

    expect(routerPush).toHaveBeenCalledWith({ name: 'projects' });
  });

  it('在个人中心为当前项目添加私有工程目录', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useAuthStore } = await import('@/stores/auth');
    const { useProjectStore } = await import('@/stores/project');
    useAuthStore().applySession({
      token: 'token-1',
      expireAt: new Date(Date.now() + 86_400_000).toISOString(),
      user: {
        id: 7,
        account: 'key.lin',
        displayName: 'Key Lin',
        status: 'ACTIVE'
      }
    });
    const project = useProjectStore();
    project.current = {
      id: 2,
      name: 'AI Delivery',
      code: 'ai-delivery',
      status: 'ACTIVE',
      role: 'OWNER'
    };

    const wrapper = mount(Settings, {
      global: {
        plugins: [pinia],
        stubs: stubs()
      }
    });
    await flushPromises();
    (wrapper.vm as any).newPath = '/Users/me/work';
    await (wrapper.vm as any).addPath();

    expect(apiClient.saveWorkspaceMapping).toHaveBeenCalledWith(2, { localPath: '/Users/me/work' });
  });

  it('在个人中心手动更新当前项目 Skill', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useAuthStore } = await import('@/stores/auth');
    const { useProjectStore } = await import('@/stores/project');
    useAuthStore().applySession({
      token: 'token-1',
      expireAt: new Date(Date.now() + 86_400_000).toISOString(),
      user: {
        id: 7,
        account: 'key.lin',
        displayName: 'Key Lin',
        status: 'ACTIVE'
      }
    });
    const project = useProjectStore();
    project.current = {
      id: 2,
      name: 'AI Delivery',
      code: 'ai-delivery',
      status: 'ACTIVE',
      role: 'OWNER',
      repository: {
        id: 10,
        projectId: 2,
        provider: 'PROJECT_GIT',
        repoUrl: 'git@example.com:demo.git',
        defaultBranch: 'master',
        repoCode: 'ai-delivery',
        status: 'ACTIVE'
      }
    };
    vi.mocked(apiClient.updateProjectSkills).mockResolvedValue({
      bootstrap: {
        openSpecInitialized: false,
        agentDirsInitialized: [],
        codingSkills: {
          synced: 3,
          targetDirs: ['.codex/skills']
        }
      },
      state: {
        projectId: 2,
        clientSessionId: 11,
        localRepoPath: '/Users/me/delivery/ai-delivery',
        syncStatus: 'DIRTY'
      }
    });

    const wrapper = mount(Settings, {
      global: {
        plugins: [pinia],
        stubs: stubs()
      }
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text().includes('更新 Skill'))?.trigger('click');
    await flushPromises();

    expect(apiClient.updateProjectSkills).toHaveBeenCalledWith(2);
    const repoState = (wrapper.vm as any).projectRepoState;
    expect((repoState.value || repoState).syncStatus).toBe('DIRTY');
  });
});
