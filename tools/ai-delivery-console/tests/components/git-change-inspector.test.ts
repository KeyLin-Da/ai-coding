import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GitChangeInspector from '../../src/components/GitChangeInspector.vue';
import type { GitChangeSummary } from '../../shared/workflow';

describe('GitChangeInspector', () => {
  it('展示工程概览、文件列表并用 diff2html 渲染差异', () => {
    const summary: GitChangeSummary = {
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

    const wrapper = mount(GitChangeInspector, {
      props: {
        summary
      }
    });

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

    const wrapper = mount(GitChangeInspector, {
      props: {
        summary
      }
    });

    expect(wrapper.text()).toContain('1 个正式变更');
    expect(wrapper.text()).toContain('1 个待确认新文件');
    expect(wrapper.text()).toContain('待确认新文件');
    expect(wrapper.find('.git-untracked-row').text()).toContain('src/generated.ts');
    expect(wrapper.findAll('.git-file-row').some((row) => row.text().includes('src/generated.ts'))).toBe(false);
    expect(wrapper.html()).toContain('d2h-file-wrapper');
  });
});
