import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GitChangeInspector from '../../src/components/GitChangeInspector.vue';
import type { GitChangeSummary } from '../../shared/workflow';
import { apiClient } from '@/api/client';
import { ElMessage } from 'element-plus';

vi.mock('@/api/client', () => ({
  apiClient: {
    stageUntrackedFiles: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn()
    }
  };
});

function componentStubs() {
  return {
    ElAlert: {
      props: ['title'],
      template: '<div>{{ title }}</div>'
    },
    ElButton: {
      props: ['disabled', 'loading'],
      emits: ['click'],
      template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
    },
    ElCheckbox: {
      props: ['modelValue', 'indeterminate'],
      emits: ['change'],
      template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'change\', $event.target.checked)" /><slot /></label>'
    },
    ElEmpty: {
      props: ['description'],
      template: '<div>{{ description }}<slot /></div>'
    },
    ElRadioButton: {
      template: '<span><slot /></span>'
    },
    ElRadioGroup: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template:
        '<div><button class="radio-flat" @click="$emit(\'update:modelValue\', \'flat\')">平铺</button><button class="radio-tree" @click="$emit(\'update:modelValue\', \'tree\')">目录</button><button class="radio-line" @click="$emit(\'update:modelValue\', \'line-by-line\')">统一视图</button><button class="radio-side" @click="$emit(\'update:modelValue\', \'side-by-side\')">左右对比</button><slot /></div>'
    },
    ElTabPane: {
      template: '<div><slot name="label" /><slot /></div>'
    },
    ElTabs: {
      template: '<div><slot /></div>'
    },
    ElTag: {
      template: '<span><slot /></span>'
    }
  };
}

function mountInspector(summary: GitChangeSummary, requirementId = '172014') {
  return mount(GitChangeInspector, {
    props: {
      summary,
      requirementId
    },
    global: {
      stubs: componentStubs()
    }
  });
}

function baseSummary(): GitChangeSummary {
  return {
    updatedAt: '2026-05-26T10:00:00.000Z',
    additions: 1,
    deletions: 1,
    files: [
      {
        path: 'opp-gateway/src/a.ts',
        status: 'M',
        staged: false,
        unstaged: true,
        additions: 1,
        deletions: 1
      }
    ],
    untrackedFiles: [
      {
        path: 'opp-gateway/src/generated.ts',
        status: '??',
        staged: false,
        unstaged: true
      }
    ],
    diff: '',
    projects: [
      {
        project: {
          name: 'opp-gateway',
          path: 'opp-gateway'
        },
        currentBranch: 'feature/opp#172014',
        expectedBranch: 'feature/opp#172014',
        branchMatches: true,
        additions: 1,
        deletions: 1,
        files: [
          {
            path: 'src/a.ts',
            status: 'M',
            staged: false,
            unstaged: true,
            additions: 1,
            deletions: 1
          }
        ],
        untrackedFiles: [
          {
            path: 'src/generated.ts',
            status: '??',
            staged: false,
            unstaged: true
          }
        ],
        stagedDiff: '',
        unstagedDiff: [
          'diff --git a/src/a.ts b/src/a.ts',
          'index e69de29..4b825dc 100644',
          '--- a/src/a.ts',
          '+++ b/src/a.ts',
          '@@ -1 +1 @@',
          '-old',
          '+new'
        ].join('\n'),
        diff: [
          'diff --git a/src/a.ts b/src/a.ts',
          'index e69de29..4b825dc 100644',
          '--- a/src/a.ts',
          '+++ b/src/a.ts',
          '@@ -1 +1 @@',
          '-old',
          '+new'
        ].join('\n')
      }
    ]
  };
}

describe('GitChangeInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('展示工程概览、文件列表并用 diff2html 渲染差异', () => {
    const wrapper = mountInspector(baseSummary());

    expect(wrapper.text()).toContain('工程变更概览');
    expect(wrapper.text()).toContain('opp-gateway');
    expect(wrapper.text()).toContain('src/a.ts');
    expect(wrapper.text()).toContain('待确认新文件');
    expect(wrapper.text()).toContain('src/generated.ts');
    expect(wrapper.html()).toContain('d2h-file-wrapper');
  });

  it('兼容缺少 untrackedFiles 的旧 Git 响应，并将 ?? 文件拆为待确认新文件', () => {
    const summary = {
      updatedAt: '2026-05-26T10:00:00.000Z',
      additions: 1,
      deletions: 1,
      files: [
        {
          path: 'opp-gateway/src/a.ts',
          status: 'M',
          staged: false,
          unstaged: true,
          additions: 1,
          deletions: 1
        },
        {
          path: 'opp-gateway/src/generated.ts',
          status: '??',
          staged: false,
          unstaged: true
        }
      ],
      diff: '',
      projects: [
        {
          project: {
            name: 'opp-gateway',
            path: 'opp-gateway'
          },
          currentBranch: 'feature/opp#172014',
          expectedBranch: 'feature/opp#172014',
          branchMatches: true,
          additions: 1,
          deletions: 1,
          files: [
            {
              path: 'src/a.ts',
              status: 'M',
              staged: false,
              unstaged: true,
              additions: 1,
              deletions: 1
            },
            {
              path: 'src/generated.ts',
              status: '??',
              staged: false,
              unstaged: true
            }
          ],
          stagedDiff: '',
          unstagedDiff: [
            'diff --git a/src/a.ts b/src/a.ts',
            'index e69de29..4b825dc 100644',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new'
          ].join('\n'),
          diff: [
            'diff --git a/src/a.ts b/src/a.ts',
            'index e69de29..4b825dc 100644',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new'
          ].join('\n')
        }
      ]
    } as unknown as GitChangeSummary;

    const wrapper = mountInspector(summary);

    expect(wrapper.text()).toContain('1 个正式变更');
    expect(wrapper.text()).toContain('1 个待确认新文件');
    expect(wrapper.text()).toContain('待确认新文件');
    expect(wrapper.find('.git-untracked-row').text()).toContain('src/generated.ts');
    expect(wrapper.findAll('.git-file-row').some((row) => row.text().includes('src/generated.ts'))).toBe(false);
    expect(wrapper.html()).toContain('d2h-file-wrapper');
  });

  it('支持目录视图分区展示正式变更树和待确认新文件树', async () => {
    const summary = baseSummary();
    summary.projects[0].files[0].path = 'src/main/java/com/infinitus/opp/demo/service/impl/VeryLongNamedService.java';
    summary.projects[0].untrackedFiles = [
      {
        path: 'src/main/java/com/infinitus/opp/demo/service/validator/GeneratedValidator.java',
        status: '??',
        staged: false,
        unstaged: true
      },
      {
        path: 'src/test/java/com/infinitus/opp/demo/service/impl/GeneratedServiceTest.java',
        status: '??',
        staged: false,
        unstaged: true
      }
    ];

    const wrapper = mountInspector(summary);
    await wrapper.findAll('.radio-tree')[0].trigger('click');

    const changedSection = wrapper.find('.git-tree-changed-section');
    const pendingSection = wrapper.find('.git-tree-pending-section');
    const pendingDirectoryRows = pendingSection.findAll('.git-tree-directory-row');
    const validatorRow = pendingDirectoryRows.find((row) => row.text().includes('src/main/java/com/infinitus/opp/demo/service/validator'));
    const testImplRow = pendingDirectoryRows.find((row) => row.text().includes('src/test/java/com/infinitus/opp/demo/service/impl'));

    expect(wrapper.find('.git-directory-title').exists()).toBe(false);
    expect(wrapper.find('.git-untracked-section').exists()).toBe(false);
    expect(changedSection.exists()).toBe(true);
    expect(pendingSection.exists()).toBe(true);
    expect(changedSection.text()).toContain('正式变更');
    expect(changedSection.find('.git-tree-file-row').text()).toContain('VeryLongNamedService.java');
    expect(changedSection.find('.git-tree-file-row').text()).not.toContain('src/main/java/com/infinitus/opp/demo/service/impl/VeryLongNamedService.java');
    expect(changedSection.text()).not.toContain('GeneratedValidator.java');
    expect(pendingSection.text()).toContain('待确认新文件');
    expect(pendingDirectoryRows.length).toBeGreaterThan(6);
    expect(validatorRow?.text()).toContain('1 待确认');
    expect(testImplRow?.text()).toContain('1 待确认');
    expect(pendingSection.text()).toContain('GeneratedValidator.java');
    expect(pendingSection.text()).toContain('GeneratedServiceTest.java');
    expect(pendingSection.text()).not.toContain('src/main/java/com/infinitus/opp/demo/service/validator/GeneratedValidator.java');
    expect(pendingSection.text()).not.toContain('src/test/java/com/infinitus/opp/demo/service/impl/GeneratedServiceTest.java');
    expect(pendingSection.findAll('.git-tree-untracked-row')).toHaveLength(2);
  });

  it('按 Git 状态给文件名着色', async () => {
    const summary = baseSummary();
    summary.projects[0].files = [
      {
        path: 'src/a.ts',
        status: 'M',
        staged: false,
        unstaged: true,
        additions: 1,
        deletions: 1
      },
      {
        path: 'src/new.ts',
        status: 'A',
        staged: true,
        unstaged: false,
        additions: 3,
        deletions: 0
      }
    ];

    const wrapper = mountInspector(summary);
    const flatPathByText = (text: string) => wrapper.findAll('.git-file-path').find((path) => path.text() === text);

    expect(flatPathByText('src/a.ts')?.classes()).toContain('git-file-path-modified');
    expect(flatPathByText('src/new.ts')?.classes()).toContain('git-file-path-added');
    expect(flatPathByText('src/generated.ts')?.classes()).toContain('git-file-path-pending');

    await wrapper.findAll('.radio-tree')[0].trigger('click');
    const treePathByText = (text: string) => wrapper.findAll('.git-tree-file-row .git-file-path, .git-tree-untracked-row .git-file-path').find((path) => path.text() === text);

    expect(treePathByText('a.ts')?.classes()).toContain('git-file-path-modified');
    expect(treePathByText('new.ts')?.classes()).toContain('git-file-path-added');
    expect(treePathByText('generated.ts')?.classes()).toContain('git-file-path-pending');
  });

  it('支持选择待确认新文件并在暂存成功后回传新摘要', async () => {
    const summary = baseSummary();
    const refreshed: GitChangeSummary = {
      ...summary,
      untrackedFiles: [],
      projects: [
        {
          ...summary.projects[0],
          files: [
            ...summary.projects[0].files,
            {
              path: 'src/generated.ts',
              status: 'A',
              staged: true,
              unstaged: false
            }
          ],
          untrackedFiles: []
        }
      ]
    };
    vi.mocked(apiClient.stageUntrackedFiles).mockResolvedValue(refreshed);
    const wrapper = mountInspector(summary);

    await wrapper.find('.git-untracked-row input').setValue(true);
    await wrapper.find('.stage-untracked-button').trigger('click');
    await flushPromises();

    expect(apiClient.stageUntrackedFiles).toHaveBeenCalledWith('172014', {
      projectPath: 'opp-gateway',
      files: ['src/generated.ts']
    });
    expect(wrapper.emitted('updated')?.[0]?.[0]).toEqual(refreshed);
    expect(ElMessage.success).toHaveBeenCalledWith('已加入暂存区 1 个待确认新文件');
  });

  it('支持 diff 预览全屏和 ESC 退出', async () => {
    const wrapper = mountInspector(baseSummary());

    expect(wrapper.find('.git-diff-pane').classes()).not.toContain('fullscreen');
    await wrapper.find('.git-diff-fullscreen-button').trigger('click');
    expect(wrapper.find('.git-diff-pane').classes()).toContain('fullscreen');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.git-diff-pane').classes()).not.toContain('fullscreen');
  });
});
