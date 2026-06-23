import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewDialog from '../../src/components/ReviewDialog.vue';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    planArtifactGitSync: vi.fn(),
    confirmArtifactGitSync: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn()
    }
  };
});

function stubs() {
  return {
    ElDialog: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<section v-if="modelValue"><slot /><footer><slot name="footer" /></footer></section>'
    },
    ElSteps: {
      template: '<div><slot /></div>'
    },
    ElStep: {
      template: '<span />'
    },
    ElForm: {
      template: '<form><slot /></form>'
    },
    ElFormItem: {
      props: ['label'],
      template: '<label><span>{{ label }}</span><slot /></label>'
    },
    ElAlert: {
      props: ['title'],
      template: '<div>{{ title }}</div>'
    },
    ElRadioGroup: {
      template: '<div><slot /></div>'
    },
    ElRadioButton: {
      props: ['value'],
      template: '<button type="button"><slot /></button>'
    },
    ElInput: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    },
    ElDescriptions: {
      template: '<dl><slot /></dl>'
    },
    ElDescriptionsItem: {
      props: ['label'],
      template: '<div><dt>{{ label }}</dt><dd><slot /></dd></div>'
    },
    ElButton: {
      props: ['disabled', 'loading'],
      template: '<button :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ArtifactGitSyncPanel: {
      props: ['plan', 'selectedFiles'],
      template: '<div class="sync-panel-stub">{{ plan.files.length }}</div>'
    }
  };
}

describe('ReviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('审核通过时先生成 Git 同步计划，确认后携带 review 信息推送', async () => {
    vi.mocked(apiClient.planArtifactGitSync).mockResolvedValue({
      requirementId: '172014',
      stage: 'TECH_DESIGN',
      syncType: 'REVIEW_APPROVAL',
      blocked: false,
      blockers: [],
      repoPath: '/Users/me/ai-delivery',
      headCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      remoteCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      files: [
        {
          path: 'docs/172014/technical-design/design_review.md',
          status: 'M',
          selected: true,
          contentSha256: 'sha256'
        }
      ],
      diff: 'diff --git a/docs/172014/technical-design/design_review.md b/docs/172014/technical-design/design_review.md'
    });
    vi.mocked(apiClient.confirmArtifactGitSync).mockResolvedValue({
      commitSha: 'cccccccccccccccccccccccccccccccccccccccc',
      pushed: true,
      centerResult: {
        syncedFiles: ['docs/172014/technical-design/design_review.md']
      }
    });

    const wrapper = mount(ReviewDialog, {
      global: {
        stubs: stubs()
      }
    });
    (wrapper.vm as any).open('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', undefined, '172014', 100);
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === '下一步')?.trigger('click');
    await flushPromises();
    expect(apiClient.planArtifactGitSync).toHaveBeenCalledWith('172014', {
      stage: 'TECH_DESIGN',
      syncType: 'REVIEW_APPROVAL'
    });

    await wrapper.findAll('button').find((button) => button.text() === '下一步')?.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === '确认推送并通过')?.trigger('click');
    await flushPromises();

    expect(apiClient.confirmArtifactGitSync).toHaveBeenCalledWith('172014', {
      stage: 'TECH_DESIGN',
      syncType: 'REVIEW_APPROVAL',
      requirementPk: 100,
      files: ['docs/172014/technical-design/design_review.md'],
      message: 'ai-delivery(172014): sync TECH_DESIGN',
      review: {
        decision: 'APPROVED',
        comment: ''
      }
    });
    expect(wrapper.emitted('synced')?.[0]?.[0]).toEqual({
      commitSha: 'cccccccccccccccccccccccccccccccccccccccc',
      pushed: true,
      centerResult: {
        syncedFiles: ['docs/172014/technical-design/design_review.md']
      }
    });
  });

  it('实施验证子步骤通过时直接提交普通审核且不生成 Git 同步计划', async () => {
    const wrapper = mount(ReviewDialog, {
      global: {
        stubs: stubs()
      }
    });
    (wrapper.vm as any).open('IMPLEMENTATION', undefined, 'CHANGE_INSPECTION', '141846', 200);
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === '提交')?.trigger('click');
    await flushPromises();

    expect(apiClient.planArtifactGitSync).not.toHaveBeenCalled();
    expect(apiClient.confirmArtifactGitSync).not.toHaveBeenCalled();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      stage: 'IMPLEMENTATION',
      implementationStep: 'CHANGE_INSPECTION',
      decision: 'APPROVED',
      comment: '',
      artifactPath: undefined
    });
  });

  it('审核同步计划为空时允许直接提交审核结论', async () => {
    vi.mocked(apiClient.planArtifactGitSync).mockResolvedValue({
      requirementId: '141846',
      stage: 'IMPLEMENTATION',
      syncType: 'REVIEW_APPROVAL',
      blocked: false,
      blockers: [],
      repoPath: '/Users/me/ai-delivery',
      headCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      remoteCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      files: [],
      diff: ''
    });
    vi.mocked(apiClient.confirmArtifactGitSync).mockResolvedValue({
      pushed: false,
      centerResult: {
        reviewed: true
      }
    });

    const wrapper = mount(ReviewDialog, {
      global: {
        stubs: stubs()
      }
    });
    (wrapper.vm as any).open('IMPLEMENTATION', undefined, undefined, '141846', 200);
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === '下一步')?.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('0');

    await wrapper.findAll('button').find((button) => button.text() === '下一步')?.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === '确认提交审核')?.trigger('click');
    await flushPromises();

    expect(apiClient.confirmArtifactGitSync).toHaveBeenCalledWith('141846', {
      stage: 'IMPLEMENTATION',
      syncType: 'REVIEW_APPROVAL',
      requirementPk: 200,
      files: [],
      message: 'ai-delivery(141846): sync IMPLEMENTATION',
      review: {
        decision: 'APPROVED',
        comment: ''
      }
    });
    expect(wrapper.emitted('synced')?.[0]?.[0]).toEqual({
      pushed: false,
      centerResult: {
        reviewed: true
      }
    });
  });

  it('顶层审核同步失败时保留确认链路不关闭弹窗', async () => {
    vi.mocked(apiClient.planArtifactGitSync).mockResolvedValue({
      requirementId: '172014',
      stage: 'IMPLEMENTATION',
      syncType: 'REVIEW_APPROVAL',
      blocked: false,
      blockers: [],
      repoPath: '/Users/me/ai-delivery',
      headCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      remoteCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      files: [
        {
          path: 'openspec/changes/req-172014/tasks.md',
          status: 'M',
          selected: true,
          contentSha256: 'sha256'
        }
      ],
      diff: 'diff --git a/openspec/changes/req-172014/tasks.md b/openspec/changes/req-172014/tasks.md'
    });
    vi.mocked(apiClient.confirmArtifactGitSync).mockRejectedValue(new Error('Git push失败或远端已更新'));

    const wrapper = mount(ReviewDialog, {
      global: {
        stubs: stubs()
      }
    });
    (wrapper.vm as any).open('IMPLEMENTATION', undefined, undefined, '172014', 100);
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === '下一步')?.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === '下一步')?.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === '确认推送并通过')?.trigger('click');
    await flushPromises();

    expect(apiClient.confirmArtifactGitSync).toHaveBeenCalled();
    expect(wrapper.findAll('button').some((button) => button.text() === '确认推送并通过')).toBe(true);
    expect(wrapper.emitted('synced')).toBeUndefined();
  });
});
