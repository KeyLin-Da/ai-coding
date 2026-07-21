import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GitChangeInspector from '../../src/components/GitChangeInspector.vue';
import type { GitChangeSummary } from '../../shared/workflow';
import { apiClient } from '@/api/client';
import { ElMessage } from 'element-plus';

vi.mock('@/api/client', () => ({
  apiClient: {
    stageUntrackedFiles: vi.fn(),
    getGitDiffPreview: vi.fn(),
    getGitChangedFilePreview: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
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
    ElDialog: {
      props: ['modelValue'],
      template: '<div v-if="modelValue" class="dialog"><slot name="header" /><slot /></div>'
    },
    ElDropdown: {
      template: '<div class="dropdown"><slot /><slot name="dropdown" /></div>'
    },
    ElDropdownMenu: {
      template: '<div><slot /></div>'
    },
    ElDropdownItem: {
      props: ['command'],
      template: '<button class="dropdown-item"><slot /></button>'
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
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      configurable: true
    });
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

  it('在右侧 diff 文件头展示统计并支持单文件和全量展开收起', async () => {
    const wrapper = mountInspector(baseSummary());

    expect(wrapper.find('.git-diff-total').text()).toContain('1 个文件');
    expect(wrapper.find('.git-diff-file-header').text()).toContain('src/a.ts');
    expect(wrapper.find('.git-diff-file-header').text()).toContain('+1');
    expect(wrapper.find('.git-diff-file-header').text()).toContain('-1');

    await wrapper.find('.git-diff-file-toggle').trigger('click');
    expect(wrapper.find('.git-diff-file-body').isVisible()).toBe(false);

    await wrapper.find('.git-diff-expand-all-button').trigger('click');
    expect(wrapper.find('.git-diff-file-body').isVisible()).toBe(true);

    await wrapper.find('.git-diff-collapse-all-button').trigger('click');
    expect(wrapper.find('.git-diff-file-body').isVisible()).toBe(false);
  });

  it('支持从右侧文件头复制路径并切换扩展上下文', async () => {
    const summary = baseSummary();
    const expandedDiff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index e69de29..4b825dc 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new-with-context'
    ].join('\n');
    vi.mocked(apiClient.getGitDiffPreview).mockResolvedValue({
      projectPath: 'opp-gateway',
      filePath: undefined,
      contextLines: 30,
      diff: expandedDiff,
      truncated: true,
      files: summary.projects[0].files
    });
    const wrapper = mountInspector(summary);

    // 菜单命令直接作用于当前 diff 文件头对应的文件。
    const item = (wrapper.vm as any).renderedDiffFiles[0];
    await (wrapper.vm as any).handleDiffFileCommand('copy', item);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('src/a.ts');
    expect(ElMessage.success).toHaveBeenCalledWith('已复制文件路径');

    await wrapper.find('.git-context-select').setValue('30');
    await flushPromises();

    expect(apiClient.getGitDiffPreview).toHaveBeenCalledWith('172014', {
      projectPath: 'opp-gateway',
      filePath: undefined,
      contextLines: 30
    });
    expect(wrapper.html()).toContain('new-with-context');
    expect(ElMessage.warning).toHaveBeenCalledWith('扩展上下文后的 diff 内容过长，已截断展示');
  });

  it('支持从右侧文件头查看完整文件并定位首个变更行', async () => {
    vi.mocked(apiClient.getGitChangedFilePreview).mockResolvedValue({
      projectPath: 'opp-gateway',
      filePath: 'src/a.ts',
      language: 'typescript',
      size: 16,
      updatedAt: '2026-05-26T10:00:00.000Z',
      focusLine: 1,
      previewable: true,
      content: 'new\nnext\n'
    });
    const wrapper = mountInspector(baseSummary());
    const item = (wrapper.vm as any).renderedDiffFiles[0];

    // 完整文件预览使用首个变更新行号作为 focusLine，打开后应展示源码内容。
    await (wrapper.vm as any).handleDiffFileCommand('view', item);
    await flushPromises();

    expect(apiClient.getGitChangedFilePreview).toHaveBeenCalledWith('172014', {
      projectPath: 'opp-gateway',
      filePath: 'src/a.ts',
      focusLine: 1
    });
    expect(wrapper.find('.dialog').text()).toContain('src/a.ts');
    expect(wrapper.find('.dialog').text()).toContain('typescript');
    expect(wrapper.find('.git-file-preview-line.focus').text()).toContain('new');
  });

  it('完整文件不可预览时展示可读提示', async () => {
    vi.mocked(apiClient.getGitChangedFilePreview).mockResolvedValue({
      projectPath: 'opp-gateway',
      filePath: 'src/a.ts',
      language: 'typescript',
      size: 0,
      previewable: false,
      reason: '文件当前不存在或不可预览'
    });
    const wrapper = mountInspector(baseSummary());
    const item = (wrapper.vm as any).renderedDiffFiles[0];

    await (wrapper.vm as any).handleDiffFileCommand('view', item);
    await flushPromises();

    expect(wrapper.find('.dialog').text()).toContain('文件当前不存在或不可预览');
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
