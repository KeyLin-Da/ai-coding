import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from '../../src/views/Login.vue';
import ProjectList from '../../src/views/ProjectList.vue';
import { apiClient } from '@/api/client';
import { useSettingsStore } from '@/stores/settings';

const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPush
  })
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    login: vi.fn(),
    register: vi.fn(),
    listMyProjects: vi.fn(),
    createProject: vi.fn(),
    joinProject: vi.fn(),
    selectProject: vi.fn(),
    getProjectRepositoryStatus: vi.fn(),
    listWorkspaceMappings: vi.fn(),
    saveWorkspaceMapping: vi.fn(),
    registerClientSession: vi.fn()
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
    },
    ElMessageBox: {
      confirm: vi.fn().mockResolvedValue(true)
    }
  };
});

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

function stubs() {
  return {
    ElButton: {
      props: ['loading', 'type', 'icon'],
      template: '<button :disabled="loading" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ElTabs: {
      template: '<div><slot /></div>'
    },
    ElTabPane: {
      template: '<section><slot /></section>'
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
      emits: ['update:modelValue', 'keyup'],
      template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    },
    ElDialog: {
      template: '<section><slot /><footer><slot name="footer" /></footer></section>'
    },
    ElTable: {
      props: ['data'],
      template: '<div><slot /></div>'
    },
    ElTableColumn: {
      template: '<div><slot name="default" :row="{}" /></div>'
    },
    ElEmpty: {
      template: '<div />'
    }
  };
}

describe('onboarding pages', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock();
    routerPush.mockReset();
    vi.clearAllMocks();
    vi.mocked(apiClient.registerClientSession).mockResolvedValue({ id: 11, clientKey: 'test-client' });
  });

  it('登录页账号登录成功后进入项目列表', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
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
    vi.mocked(apiClient.listMyProjects).mockResolvedValue([]);

    const wrapper = mount(Login, {
      global: {
        plugins: [pinia],
        stubs: stubs()
      }
    });
    await wrapper.find('input').setValue('key.lin');
    await wrapper.findAll('button').find((button) => button.text().includes('登录'))?.trigger('click');
    await flushPromises();

    expect(apiClient.login).toHaveBeenCalledWith({ account: 'key.lin' });
    expect(routerPush).toHaveBeenCalledWith({ name: 'projects' });
  });

  it('项目页创建项目后迁移旧本机目录到当前项目私有配置', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = {
      id: 2,
      name: 'AI Delivery',
      code: 'ai-delivery',
      status: 'ACTIVE',
      role: 'OWNER',
      selected: true,
      repository: {
        provider: 'GITLAB',
        repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
        defaultBranch: 'master'
      }
    };
    vi.mocked(apiClient.listMyProjects).mockResolvedValue([]);
    vi.mocked(apiClient.createProject).mockResolvedValue(project);
    vi.mocked(apiClient.selectProject).mockResolvedValue(project);
    vi.mocked(apiClient.getProjectRepositoryStatus).mockResolvedValue({
      projectId: 2,
      syncStatus: 'READY'
    });
    vi.mocked(apiClient.listWorkspaceMappings).mockResolvedValue([]);
    vi.mocked(apiClient.saveWorkspaceMapping).mockResolvedValue({
      id: 1,
      projectId: 2,
      localPath: '/Users/me/work',
      status: 'ACTIVE'
    });
    const settings = useSettingsStore();
    settings.desktopConfig.workspaceMappings = [{ projectId: 'legacy', localPath: '/Users/me/work' }];

    const wrapper = mount(ProjectList, {
      global: {
        plugins: [pinia],
        stubs: stubs()
      }
    });
    await flushPromises();
    (wrapper.vm as any).createName = 'AI Delivery';
    (wrapper.vm as any).createRepoUrl = 'git@git.example.com:opp/ai-delivery-artifacts.git';
    await (wrapper.vm as any).createProject();
    await flushPromises();

    expect(apiClient.createProject).toHaveBeenCalledWith({
      name: 'AI Delivery',
      repository: {
        provider: 'GITLAB',
        repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
        defaultBranch: 'master'
      }
    });
    expect(apiClient.saveWorkspaceMapping).toHaveBeenCalledWith(2, { localPath: '/Users/me/work' });
    expect(routerPush).toHaveBeenCalledWith({ name: 'requirements' });
  });
});
