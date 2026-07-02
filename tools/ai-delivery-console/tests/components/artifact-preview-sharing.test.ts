import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ArtifactRef } from '../../shared/workflow';
import ArtifactPreviewPage from '../../src/views/ArtifactPreviewPage.vue';
import PublicArtifactPreviewPage from '../../src/views/PublicArtifactPreviewPage.vue';
import ArtifactShareDialog from '../../src/components/ArtifactShareDialog.vue';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { useWorkflowStore } from '@/stores/workflow';

const realtimeMocks = {
  subscribeArtifactShare: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  options: undefined as any
};
(globalThis as any).__artifactRealtimeMocks = realtimeMocks;

const routeState = {
  query: {} as Record<string, string>,
  params: {} as Record<string, string>,
  fullPath: ''
};
const routerPush = vi.fn();
(globalThis as any).__artifactPreviewRouteState = routeState;

vi.mock('vue-router', () => ({
  useRoute: () => (globalThis as any).__artifactPreviewRouteState,
  useRouter: () => ({ push: routerPush })
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    readArtifact: vi.fn(),
    readPublicArtifactSharePreview: vi.fn(),
    listPublicArtifactShares: vi.fn(),
    createPublicArtifactShare: vi.fn(),
    revokePublicArtifactShare: vi.fn(),
    regeneratePublicArtifactShareToken: vi.fn()
  }
}));

vi.mock('@/services/realtime-client', () => ({
  RealtimeClient: class {
    constructor(options: unknown) {
      (globalThis as any).__artifactRealtimeMocks.options = options;
    }

    subscribeArtifactShare = (...args: unknown[]) => (globalThis as any).__artifactRealtimeMocks.subscribeArtifactShare(...args);
    disconnect = () => (globalThis as any).__artifactRealtimeMocks.disconnect();
  }
}));

function shellStub() {
  return {
    name: 'ArtifactPreviewShell',
    props: [
      'artifact',
      'content',
      'loading',
      'allowDownload',
      'canShare',
      'publicToken',
      'projectId',
      'requirementPk',
      'showAnnotations',
      'canCreateAnnotation',
      'currentUserId',
      'publicShareId'
    ],
    template:
      '<section class="shell"><button v-if="canShare" class="share-button" @click="$emit(\'share\')">分享</button><button class="login-required-button" @click="$emit(\'login-required\')">登录后批注</button><slot /></section>'
  };
}

function elementStubs() {
  return {
    ElButton: {
      props: ['loading', 'type', 'icon', 'disabled'],
      template: '<button :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ElDialog: {
      props: ['modelValue', 'title'],
      template: '<section v-if="modelValue"><slot /></section>'
    },
    ElInput: {
      props: ['modelValue', 'readonly'],
      template: '<label><input :value="modelValue" :readonly="readonly" /><slot name="append" /></label>'
    },
    ElDatePicker: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<input class="date-picker" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    },
    ElCheckbox: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>'
    },
    ElTable: {
      template: '<div><slot /></div>'
    },
    ElTableColumn: {
      template: '<div />'
    }
  };
}

const artifact: ArtifactRef = {
  id: 'docs/172014/technical-design/design_review.md',
  stage: 'TECH_DESIGN',
  label: '技术方案',
  path: 'docs/172014/technical-design/design_review.md',
  kind: 'markdown',
  exists: true
};

describe('artifact preview sharing pages', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routeState.query = {};
    routeState.params = {};
    routeState.fullPath = '';
    vi.clearAllMocks();
    realtimeMocks.subscribeArtifactShare.mockResolvedValue(undefined);
    realtimeMocks.options = undefined;
    routerPush.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  it('登录分享页按 query 读取指定项目的产物', async () => {
    routeState.query = {
      projectId: '10',
      requirementId: '172014',
      path: artifact.path
    };
    const project = useProjectStore();
    const targetProject = {
      id: 10,
      name: '目标项目',
      code: 'target',
      status: 'ACTIVE',
      role: 'MEMBER'
    };
    project.projects = [targetProject];
    project.current = {
      id: 9,
      name: '其他项目',
      code: 'other',
      status: 'ACTIVE',
      role: 'MEMBER'
    };
    const selectProject = vi.spyOn(project, 'selectProject').mockImplementation(async (selected) => {
      project.current = selected;
    });
    const workflow = useWorkflowStore();
    const loadRequirement = vi.spyOn(workflow, 'loadRequirement').mockResolvedValue(undefined);
    const streamWorkflowEvents = vi.spyOn(workflow, 'streamWorkflowEvents').mockImplementation(() => undefined);
    vi.spyOn(workflow, 'stopWorkflowStream').mockImplementation(() => undefined);
    vi.mocked(apiClient.readArtifact).mockResolvedValue({ artifact, content: '# 技术方案' });

    mount(ArtifactPreviewPage, {
      global: {
        stubs: {
          ArtifactPreviewShell: shellStub(),
          ArtifactShareDialog: { template: '<div />' }
        }
      }
    });
    await flushPromises();

    expect(selectProject).toHaveBeenCalledWith(targetProject);
    expect(apiClient.readArtifact).toHaveBeenCalledWith(artifact.path, '10');
    expect(loadRequirement).toHaveBeenCalledWith('172014');
    expect(streamWorkflowEvents).toHaveBeenCalled();
  });

  it('公开分享页只读渲染，不显示分享入口', async () => {
    routeState.params = { token: 'share-token' };
    routeState.fullPath = '/share/artifacts/share-token';
    vi.mocked(apiClient.readPublicArtifactSharePreview).mockResolvedValue({
      share: {
        id: 1,
        projectId: 10,
        requirementId: '172014',
        artifactPath: artifact.path,
        status: 'ENABLED'
      },
      artifact,
      content: '# 技术方案',
      allowDownload: false
    });

    const wrapper = mount(PublicArtifactPreviewPage, {
      global: {
        stubs: {
          ArtifactPreviewShell: shellStub()
        }
      }
    });
    await flushPromises();

    expect(apiClient.readPublicArtifactSharePreview).toHaveBeenCalledWith('share-token');
    expect(wrapper.find('.share-button').exists()).toBe(false);
  });

  it('公开分享页未登录新增批注时跳转登录并携带回跳地址', async () => {
    routeState.params = { token: 'share-token' };
    routeState.fullPath = '/share/artifacts/share-token';
    vi.mocked(apiClient.readPublicArtifactSharePreview).mockResolvedValue({
      share: {
        id: 1,
        projectId: 10,
        requirementId: '172014',
        artifactPath: artifact.path,
        status: 'ENABLED'
      },
      artifact,
      content: '# 技术方案',
      allowDownload: true,
      showAnnotations: true
    });

    const wrapper = mount(PublicArtifactPreviewPage, {
      global: {
        stubs: {
          ArtifactPreviewShell: shellStub()
        }
      }
    });
    await flushPromises();
    await wrapper.find('.login-required-button').trigger('click');

    expect(routerPush).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: '/share/artifacts/share-token' }
    });
  });

  it('公开分享页登录后使用 token 范围频道订阅批注变化', async () => {
    routeState.params = { token: 'share-token' };
    routeState.fullPath = '/share/artifacts/share-token';
    const auth = useAuthStore();
    auth.token = 'access-token';
    auth.expireAt = '2099-01-01T00:00:00.000Z';
    auth.user = { id: 2, account: 'reviewer', displayName: '分享评审人', status: 'ACTIVE' };
    vi.mocked(apiClient.readPublicArtifactSharePreview).mockResolvedValue({
      share: {
        id: 300,
        projectId: 10,
        requirementId: '172014',
        artifactPath: artifact.path,
        status: 'ENABLED',
        showAnnotations: true,
        realtimeChannel: 'channel-hash'
      },
      artifact,
      content: '# 技术方案',
      allowDownload: true,
      showAnnotations: true
    });

    const wrapper = mount(PublicArtifactPreviewPage, {
      global: {
        stubs: {
          ArtifactPreviewShell: shellStub()
        }
      }
    });
    await flushPromises();

    expect(realtimeMocks.subscribeArtifactShare).toHaveBeenCalledWith(300, 'share-token', 'channel-hash');
    expect(wrapper.findComponent({ name: 'ArtifactPreviewShell' }).props('publicShareId')).toBe(300);
    wrapper.unmount();
    expect(realtimeMocks.disconnect).toHaveBeenCalled();
  });

  it('分享弹窗创建公开链接并复制', async () => {
    vi.mocked(apiClient.listPublicArtifactShares).mockResolvedValue([]);
    vi.mocked(apiClient.createPublicArtifactShare).mockResolvedValue({
      id: 1,
      projectId: 10,
      requirementId: '172014',
      artifactPath: artifact.path,
      status: 'ENABLED',
      token: 'share-token',
      publicPath: '/share/artifacts/share-token'
    });

    const wrapper = mount(ArtifactShareDialog, {
      global: {
        stubs: elementStubs()
      }
    });
    await (wrapper.vm as any).open({ artifact, projectId: 10, requirementId: '172014' });
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text().includes('创建公开链接'))?.trigger('click');
    await flushPromises();

    expect(apiClient.createPublicArtifactShare).toHaveBeenCalledWith({
      projectId: 10,
      requirementPk: undefined,
      requirementId: '172014',
      artifactPath: artifact.path,
      expireAt: undefined,
      showAnnotations: true,
      allowDownload: true
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/share/artifacts/share-token'));
  });

  it('重新打开分享弹窗时回显并复制已有公开链接', async () => {
    vi.mocked(apiClient.listPublicArtifactShares).mockResolvedValue([
      {
        id: 1,
        projectId: 10,
        requirementId: '172014',
        artifactPath: artifact.path,
        status: 'ENABLED',
        publicPath: '/share/artifacts/existing-token'
      }
    ]);

    const wrapper = mount(ArtifactShareDialog, {
      global: {
        stubs: elementStubs()
      }
    });
    await (wrapper.vm as any).open({ artifact, projectId: 10, requirementId: '172014' });
    await flushPromises();

    const publicInput = wrapper.findAll('input').find((input) => input.element.value.includes('/share/artifacts/existing-token'));
    expect(publicInput?.exists()).toBe(true);
    const copyButtons = wrapper.findAll('button').filter((button) => button.text().includes('复制'));
    await copyButtons[copyButtons.length - 1].trigger('click');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/share/artifacts/existing-token'));
  });
});
