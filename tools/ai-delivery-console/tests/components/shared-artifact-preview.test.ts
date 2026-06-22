import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { ArtifactRef, TechDesignAnnotation } from '../../shared/workflow';
import { apiClient } from '../../src/api/client';
import ArtifactPreviewShell from '../../src/components/ArtifactPreviewShell.vue';
import artifactPreviewShellSource from '../../src/components/ArtifactPreviewShell.vue?raw';
import MarkdownOutlineNav from '../../src/components/MarkdownOutlineNav.vue';
import TechDesignAnnotationPanel from '../../src/components/TechDesignAnnotationPanel.vue';
import { createAnnotationAnchor } from '../../src/utils/tech-design-annotations';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../src/api/client', () => ({
  apiClient: {
    listPublicTechDesignAnnotations: vi.fn(),
    createPublicTechDesignAnnotation: vi.fn(),
    createPublicTechDesignAnnotationReply: vi.fn(),
    deletePublicTechDesignAnnotation: vi.fn(),
    deletePublicTechDesignAnnotationReply: vi.fn(),
    listTechDesignVersions: vi.fn(),
    readTechDesignVersion: vi.fn(),
    listTechDesignAnnotations: vi.fn(),
    createTechDesignAnnotation: vi.fn(),
    createTechDesignAnnotationReply: vi.fn(),
    deleteTechDesignAnnotationReply: vi.fn()
  }
}));

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

function annotation(overrides: Partial<TechDesignAnnotation> = {}): TechDesignAnnotation {
  return {
    id: 'annotation-1',
    requirementId: '172014',
    artifactPath: 'docs/172014/technical-design/design_review.md',
    versionId: 'current',
    versionSource: 'CURRENT_DRAFT',
    contentHash: 'hash',
    selectedText: '缓存策略',
    anchor: {
      plainStart: 4,
      plainEnd: 8,
      prefixText: '需要',
      suffixText: '说明',
      headingPath: ['技术方案'],
      occurrence: 1
    },
    comment: '补充 Redis key',
    status: 'OPEN',
    includeInNextGeneration: true,
    createdBy: 1,
    createdByName: '评审张三',
    createdAt: '2026-06-18T07:00:00.000Z',
    updatedAt: '2026-06-18T07:00:00.000Z',
    ...overrides
  };
}

describe('shared artifact preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MarkdownOutlineNav 支持目录点击和收起事件', async () => {
    const wrapper = mount(MarkdownOutlineNav, {
      props: {
        items: [
          { id: 'title', level: 1, text: '技术方案' },
          { id: 'api', level: 2, text: '接口设计' }
        ],
        activeId: 'api',
        collapsed: false
      }
    });

    expect(wrapper.text()).toContain('技术方案');
    expect(wrapper.find('.outline-item.active').text()).toBe('接口设计');
    await wrapper.findAll('.outline-item')[0].trigger('click');
    await wrapper.find('.outline-toggle').trigger('click');

    expect(wrapper.emitted('select')?.[0]).toEqual(['title']);
    expect(wrapper.emitted('update:collapsed')?.[0]).toEqual([true]);
  });

  it('ArtifactPreviewShell 为 Markdown 内容生成左侧目录', async () => {
    const artifact: ArtifactRef = {
      id: 'prd',
      label: 'PRD 分析',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true
    };
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact,
        content: '# 技术方案\n\n## 接口设计\n\n正文'
      }
    });

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.text()).toContain('收起目录');
    expect(wrapper.text()).toContain('接口设计');
  });

  it('目录点击只滚动正文容器', async () => {
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'prd',
          label: 'PRD 分析',
          path: 'docs/172014/prd/analysis.md',
          stage: 'PRD',
          kind: 'markdown',
          exists: true
        },
        content: '# 技术方案\n\n## 接口设计\n\n正文'
      }
    });
    await flushPromises();
    const scroller = wrapper.find('.preview-scroll').element as HTMLElement;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    const heading = wrapper.find('.artifact-markdown h1').element as HTMLElement;
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue({ top: 240, height: 30 } as DOMRect);

    await wrapper.findAll('.outline-item')[0].trigger('click');

    expect(scrollTo).toHaveBeenCalledWith({ top: 140, behavior: 'smooth' });
  });

  it('公开分享只展示与当前正文 hash 一致的批注', async () => {
    vi.mocked(apiClient.listPublicTechDesignAnnotations).mockResolvedValue({
      annotations: [
        annotation({ id: 'annotation-old', contentHash: 'old-hash', comment: '上一版批注' }),
        annotation({ id: 'annotation-current', contentHash: 'current-hash', selectedText: '当前内容', comment: '当前版本批注' })
      ],
      hash: 'annotation-list-hash',
      summaryPath: ''
    });
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true,
          hash: 'current-hash'
        },
        content: '# 技术方案\n\n当前内容',
        publicToken: 'share-token'
      }
    });
    await flushPromises();

    expect(wrapper.text()).toContain('当前版本批注');
    expect(wrapper.text()).not.toContain('上一版批注');
    const highlight = wrapper.find('.tech-design-annotation-highlight');
    expect(highlight.exists()).toBe(true);
    expect(artifactPreviewShellSource).toContain('.artifact-markdown :deep(.tech-design-annotation-highlight)');
    expect(artifactPreviewShellSource).toContain('background: #fef08a');
  });

  it('收到当前分享的批注变更事件后重新拉取列表并刷新正文高亮', async () => {
    vi.mocked(apiClient.listPublicTechDesignAnnotations)
      .mockResolvedValueOnce({ annotations: [], hash: 'hash-1', summaryPath: '' })
      .mockResolvedValueOnce({
        annotations: [annotation({ id: 'annotation-live', contentHash: 'current-hash', selectedText: '当前内容', comment: '实时批注' })],
        hash: 'hash-2',
        summaryPath: ''
      });
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true,
          hash: 'current-hash'
        },
        content: '# 技术方案\n\n当前内容',
        publicToken: 'share-token',
        publicShareId: 300
      }
    });
    await flushPromises();

    window.dispatchEvent(new CustomEvent('ai-delivery:tech-design-annotation-changed', {
      detail: { shareId: 300, eventId: 88, eventType: 'tech-design.annotation.changed' }
    }));
    await flushPromises();

    expect(apiClient.listPublicTechDesignAnnotations).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('实时批注');
    expect(wrapper.find('.tech-design-annotation-highlight').exists()).toBe(true);
    wrapper.unmount();
  });

  it('非分享预览收到分享写入产生的需求主键事件后刷新批注和正文高亮', async () => {
    vi.mocked(apiClient.listTechDesignVersions).mockResolvedValue({
      versions: [
        {
          id: 'current',
          source: 'CURRENT_DRAFT',
          label: '当前草稿',
          artifactPath: 'docs/172014/technical-design/design_review.md',
          contentHash: 'current-hash',
          readable: true
        }
      ]
    });
    vi.mocked(apiClient.readTechDesignVersion).mockResolvedValue({
      version: {
        id: 'current',
        source: 'CURRENT_DRAFT',
        label: '当前草稿',
        artifactPath: 'docs/172014/technical-design/design_review.md',
        contentHash: 'current-hash',
        readable: true
      },
      content: '# 技术方案\n\n当前内容'
    });
    vi.mocked(apiClient.listTechDesignAnnotations)
      .mockResolvedValueOnce({ annotations: [], hash: 'hash-1', summaryPath: '' })
      .mockResolvedValueOnce({
        annotations: [annotation({ id: 'annotation-live', contentHash: 'current-hash', selectedText: '当前内容', comment: '分享侧批注' })],
        hash: 'hash-2',
        summaryPath: ''
      });
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true
        },
        content: '# 技术方案\n\n当前内容',
        requirementPk: 100
      }
    });
    await flushPromises();

    window.dispatchEvent(new CustomEvent('ai-delivery:tech-design-annotation-changed', {
      detail: { requirementPk: 100, eventId: 89, eventType: 'tech-design.annotation.changed' }
    }));
    await flushPromises();

    expect(apiClient.listTechDesignAnnotations).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('分享侧批注');
    expect(wrapper.find('.tech-design-annotation-highlight').exists()).toBe(true);
    wrapper.unmount();
  });

  it('选择正文后在正文外释放鼠标仍激活新增批注', async () => {
    vi.mocked(apiClient.listPublicTechDesignAnnotations).mockResolvedValue({
      annotations: [],
      hash: 'annotation-list-hash',
      summaryPath: ''
    });
    const wrapper = mount(ArtifactPreviewShell, {
      attachTo: document.body,
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true,
          hash: 'current-hash'
        },
        content: '# 技术方案\n\n需要缓存策略说明。',
        publicToken: 'share-token',
        canCreateAnnotation: true,
        currentUserId: 1
      }
    });
    await flushPromises();
    const findCreateButton = () => wrapper.findAll('button').find((item) => item.text().includes('新增批注'));
    expect((findCreateButton()?.element as HTMLButtonElement).disabled).toBe(true);

    const text = wrapper.find('.artifact-markdown p').element.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 6);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(createAnnotationAnchor(wrapper.find('.artifact-markdown').element as HTMLElement)?.selectedText).toBe('缓存策略');
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await nextTick();

    expect((findCreateButton()?.element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.find('.selection-annotation-menu').text()).toContain('批注');
    window.getSelection()?.removeAllRanges();
    wrapper.unmount();
  });

  it('选择正文后可从浮层菜单创建批注', async () => {
    vi.mocked(apiClient.listPublicTechDesignAnnotations).mockResolvedValue({
      annotations: [],
      hash: 'annotation-list-hash',
      summaryPath: ''
    });
    vi.mocked(apiClient.createPublicTechDesignAnnotation).mockResolvedValue({
      annotations: [annotation({ id: 'annotation-created', comment: '新增意见' })],
      hash: 'annotation-list-after-create',
      summaryPath: ''
    });
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '新增意见' } as any);
    const wrapper = mount(ArtifactPreviewShell, {
      attachTo: document.body,
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true,
          hash: 'current-hash'
        },
        content: '# 技术方案\n\n需要缓存策略说明。',
        publicToken: 'share-token',
        canCreateAnnotation: true,
        currentUserId: 1
      }
    });
    await flushPromises();

    const text = wrapper.find('.artifact-markdown p').element.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 6);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 160, clientY: 180 }));
    await nextTick();

    await wrapper.find('.selection-annotation-menu__button').trigger('click');
    await flushPromises();

    expect(apiClient.createPublicTechDesignAnnotation).toHaveBeenCalledWith(
      'share-token',
      expect.objectContaining({
        selectedText: '缓存策略',
        comment: '新增意见',
        includeInNextGeneration: true
      })
    );
    expect(wrapper.find('.selection-annotation-menu').exists()).toBe(false);
    window.getSelection()?.removeAllRanges();
    wrapper.unmount();
  });

  it('公开分享未登录时浮层菜单触发登录引导', async () => {
    vi.mocked(apiClient.listPublicTechDesignAnnotations).mockResolvedValue({
      annotations: [],
      hash: 'annotation-list-hash',
      summaryPath: ''
    });
    const wrapper = mount(ArtifactPreviewShell, {
      attachTo: document.body,
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true,
          hash: 'current-hash'
        },
        content: '# 技术方案\n\n需要缓存策略说明。',
        publicToken: 'share-token',
        canCreateAnnotation: false
      }
    });
    await flushPromises();

    const text = wrapper.find('.artifact-markdown p').element.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 6);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 160, clientY: 180 }));
    await nextTick();

    expect(wrapper.find('.selection-annotation-menu').text()).toContain('登录后批注');
    await wrapper.find('.selection-annotation-menu__button').trigger('click');
    await nextTick();

    expect(wrapper.emitted('login-required')).toHaveLength(1);
    expect(wrapper.find('.selection-annotation-menu').exists()).toBe(false);
    window.getSelection()?.removeAllRanges();
    wrapper.unmount();
  });

  it('批注面板展示创建人和创建时间', () => {
    const wrapper = mount(TechDesignAnnotationPanel, {
      props: {
        annotations: [
          annotation({
            replies: [
              {
                id: 'reply-1',
                annotationId: 'annotation-1',
                content: '回复也要纳入生成',
                createdBy: 2,
                createdByName: '回复李四',
                createdAt: '2026-06-18T08:00:00.000Z',
                updatedAt: '2026-06-18T08:00:00.000Z'
              }
            ]
          })
        ]
      }
    });

    expect(wrapper.text()).toContain('评审张三');
    expect(wrapper.text()).toContain('2026-06-18');
    expect(wrapper.text()).toContain('补充 Redis key');
    expect(wrapper.text()).toContain('回复李四');
    expect(wrapper.text()).toContain('回复也要纳入生成');
  });

  it('公开分享登录用户可以回复批注', async () => {
    vi.mocked(apiClient.listPublicTechDesignAnnotations).mockResolvedValue({
      annotations: [annotation()],
      hash: 'annotation-list-hash',
      summaryPath: ''
    });
    vi.mocked(apiClient.createPublicTechDesignAnnotationReply).mockResolvedValue({
      annotations: [
        annotation({
          replies: [
            {
              id: 'reply-1',
              annotationId: 'annotation-1',
              content: '回复内容',
              createdBy: 1,
              createdByName: '评审张三',
              createdAt: '2026-06-18T08:00:00.000Z',
              updatedAt: '2026-06-18T08:00:00.000Z'
            }
          ]
        })
      ],
      hash: 'annotation-list-after-reply',
      summaryPath: ''
    });
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '回复内容' } as any);
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true,
          hash: 'hash'
        },
        content: '# 技术方案\n\n缓存策略',
        publicToken: 'share-token',
        canCreateAnnotation: true,
        currentUserId: 1
      }
    });
    await flushPromises();

    const replyButton = wrapper.findAll('button').find((button) => button.text() === '回复');
    expect(replyButton).toBeTruthy();
    if (!replyButton) {
      throw new Error('expected reply button');
    }
    await replyButton.trigger('click');
    await flushPromises();

    expect(apiClient.createPublicTechDesignAnnotationReply).toHaveBeenCalledWith('share-token', 'annotation-1', { content: '回复内容' });
    expect(wrapper.text()).toContain('回复内容');
  });

  it('批注面板只读模式隐藏写操作', () => {
    const wrapper = mount(TechDesignAnnotationPanel, {
      props: {
        annotations: [annotation()],
        readonly: true
      }
    });

    expect(wrapper.text()).toContain('只读批注');
    expect(wrapper.text()).not.toContain('纳入生成');
    expect(wrapper.findAll('button')).toHaveLength(2);
  });

  it('公开分享登录用户只能删除本人批注', async () => {
    vi.mocked(apiClient.listPublicTechDesignAnnotations).mockResolvedValue({
      annotations: [annotation(), annotation({ id: 'annotation-2', createdBy: 2, createdByName: '其他用户' })],
      hash: 'annotation-list-hash',
      summaryPath: ''
    });
    vi.mocked(apiClient.deletePublicTechDesignAnnotation).mockResolvedValue({
      annotations: [annotation({ id: 'annotation-2', createdBy: 2, createdByName: '其他用户' })],
      hash: 'annotation-list-after-delete',
      summaryPath: ''
    });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any);
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'technical-design',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true,
          hash: 'hash'
        },
        content: '# 技术方案\n\n缓存策略',
        publicToken: 'share-token',
        canCreateAnnotation: true,
        currentUserId: 1
      }
    });
    await flushPromises();

    const deleteButtons = wrapper.findAll('button[title="删除批注"]');
    expect(deleteButtons).toHaveLength(1);
    await deleteButtons[0].trigger('click');
    await flushPromises();

    expect(apiClient.deletePublicTechDesignAnnotation).toHaveBeenCalledWith('share-token', 'annotation-1');
  });

  it('已消费未解决批注展示为已处理待确认', () => {
    const wrapper = mount(TechDesignAnnotationPanel, {
      props: {
        annotations: [annotation({ consumedAt: '2026-06-18T08:00:00.000Z', consumedRunId: 'run-design-1' })]
      }
    });

    expect(wrapper.text()).toContain('已处理待确认');
    expect(wrapper.text()).toContain('已纳入生成');
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });
});
