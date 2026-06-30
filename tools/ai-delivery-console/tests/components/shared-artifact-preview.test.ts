import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ArtifactRef, TechDesignAnnotation } from '../../shared/workflow';
import { apiClient } from '../../src/api/client';
import ArtifactPreviewShell from '../../src/components/ArtifactPreviewShell.vue';
import artifactPreviewShellSource from '../../src/components/ArtifactPreviewShell.vue?raw';
import artifactPreviewDialogSource from '../../src/components/ArtifactPreviewDialog.vue?raw';
import artifactPreviewPageSource from '../../src/views/ArtifactPreviewPage.vue?raw';
import publicArtifactPreviewPageSource from '../../src/views/PublicArtifactPreviewPage.vue?raw';
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
    vi.mocked(mermaid.run).mockImplementation(async (options?: { nodes?: HTMLElement[] }) => {
      (options?.nodes || []).forEach((node) => {
        if (!node.querySelector('svg')) {
          node.innerHTML = '<svg viewBox="0 0 800 400" data-rendered="true"></svg>';
        }
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Markdown 产物默认使用 HTML 精排并可切换到基础预览且保持滚动位置', async () => {
    // 中文说明：模式切换只改变同一正文 DOM 的主题类，不重新解析正文或渲染图表。
    const renderSpy = vi.spyOn(MarkdownIt.prototype, 'render');
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'reading-mode',
          label: '阅读模式',
          path: 'docs/180001/prd/analysis.md',
          stage: 'PRD',
          kind: 'markdown',
          exists: true
        },
        content: '# 精排标题\n\n正文 reading-mode-unique'
      }
    });
    await flushPromises();
    const renderCount = renderSpy.mock.calls.length;
    const mermaidCount = vi.mocked(mermaid.run).mock.calls.length;
    const versionRequestCount = vi.mocked(apiClient.listTechDesignVersions).mock.calls.length;
    const annotationRequestCount = vi.mocked(apiClient.listTechDesignAnnotations).mock.calls.length;
    const scroller = wrapper.find('.preview-scroll').element as HTMLElement;
    scroller.scrollTop = 180;

    expect(wrapper.text()).toContain('HTML 预览');
    expect(wrapper.text()).toContain('Markdown 预览');
    expect(wrapper.find('.artifact-markdown').classes()).toContain('artifact-markdown--rich');
    await wrapper.findAll('.preview-reading-mode button')[1].trigger('click');
    await nextTick();

    expect(wrapper.find('.artifact-markdown').classes()).toContain('artifact-markdown--classic');
    expect(scroller.scrollTop).toBe(180);
    expect(renderSpy).toHaveBeenCalledTimes(renderCount);
    expect(mermaid.run).toHaveBeenCalledTimes(mermaidCount);
    expect(apiClient.listTechDesignVersions).toHaveBeenCalledTimes(versionRequestCount);
    expect(apiClient.listTechDesignAnnotations).toHaveBeenCalledTimes(annotationRequestCount);
    renderSpy.mockRestore();
  });

  it('打开新产物重置 HTML 预览，同一路径内容变化保留当前模式', async () => {
    // 中文说明：技术方案版本内容变化不应重置选择，但真正切换产物必须恢复默认精排。
    const baseArtifact: ArtifactRef = {
      id: 'artifact-a',
      label: '产物 A',
      path: 'docs/180002/prd/analysis.md',
      stage: 'PRD',
      kind: 'markdown',
      exists: true
    };
    const wrapper = mount(ArtifactPreviewShell, { props: { artifact: baseArtifact, content: '# A' } });
    await flushPromises();
    await wrapper.findAll('.preview-reading-mode button')[1].trigger('click');
    await wrapper.setProps({ content: '# A 的另一个版本' });
    await flushPromises();
    expect(wrapper.find('.artifact-markdown').classes()).toContain('artifact-markdown--classic');

    await wrapper.setProps({
      artifact: { ...baseArtifact, id: 'artifact-b', path: 'docs/180002/reports/verification-report.md' },
      content: '# B'
    });
    await flushPromises();
    expect(wrapper.find('.artifact-markdown').classes()).toContain('artifact-markdown--rich');
  });

  it('非 Markdown 产物不展示阅读模式切换', async () => {
    // 中文说明：原生 HTML 等既有产物类型继续沿用各自预览分支。
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'html-report',
          label: 'HTML 报告',
          path: 'docs/180003/junit/index.html',
          stage: 'IMPLEMENTATION',
          kind: 'html',
          exists: true
        },
        content: '<!doctype html><title>report</title>'
      }
    });
    await nextTick();
    expect(wrapper.find('.preview-reading-mode').exists()).toBe(false);
    expect(wrapper.find('iframe').exists()).toBe(true);
  });

  it('三类预览入口统一复用共享 ArtifactPreviewShell', () => {
    // 中文说明：需求详情、登录分享和公开分享不得复制阅读模式实现。
    expect(artifactPreviewDialogSource).toContain('<ArtifactPreviewShell');
    expect(artifactPreviewPageSource).toContain('<ArtifactPreviewShell');
    expect(publicArtifactPreviewPageSource).toContain('<ArtifactPreviewShell');
  });

  it('HTML 精排覆盖常见文档结构且不执行 Markdown 原始 HTML', async () => {
    // 中文说明：精排只增强安全 Markdown 结果，脚本标记必须被转义。
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'rich-structure',
          label: '精排结构',
          path: 'docs/180004/technical-design/overview.md',
          stage: 'TECH_DESIGN',
          kind: 'markdown',
          exists: true
        },
        content:
          '# 标题\n\n> 引用\n\n| 列 | 值 |\n| --- | --- |\n| A | B |\n\n```ts\nconst ok = true\n```\n\n![图](files/a.png)\n\n<script>window.hacked = true</script>'
      }
    });
    await flushPromises();

    const article = wrapper.find('.artifact-markdown');
    expect(article.classes()).toContain('artifact-markdown--rich');
    expect(article.find('table').attributes('data-rich-preview')).toBe('true');
    expect(article.find('blockquote').attributes('data-rich-preview')).toBe('true');
    expect(article.find('pre').attributes('data-rich-preview')).toBe('true');
    expect(article.find('img').exists()).toBe(true);
    expect(article.find('script').exists()).toBe(false);
    expect(article.text()).toContain('<script>window.hacked = true</script>');
  });

  it('单个 Mermaid 失败不影响正文和其他图表', async () => {
    // 中文说明：逐图隔离错误，失败图保留源码，后续图仍生成 SVG。
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(mermaid.run)
      .mockRejectedValueOnce(new Error('bad diagram'))
      .mockImplementationOnce(async (options?: { nodes?: HTMLElement[] }) => {
        const node = options?.nodes?.[0];
        if (node) node.innerHTML = '<svg data-second-diagram="true"></svg>';
      });
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'mermaid-isolation',
          label: '图表隔离',
          path: 'docs/180005/prd/analysis.md',
          stage: 'PRD',
          kind: 'markdown',
          exists: true
        },
        content:
          '# 正文仍可读\n\n```mermaid\ngraph LR\n  isolation-bad --> B\n```\n\n```mermaid\ngraph LR\n  isolation-good --> D\n```'
      }
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('正文仍可读');
    expect(wrapper.find('.mermaid-render-error').text()).toContain('isolation-bad');
    expect(wrapper.find('svg[data-second-diagram="true"]').exists()).toBe(true);
    expect(mermaid.run).toHaveBeenCalledTimes(2);
  });

  it('相同 Mermaid 再次打开复用 SVG 缓存，源码变化后重新渲染', async () => {
    // 中文说明：缓存只复用成功 SVG，并以图表源码和渲染版本作为失效边界。
    const artifact: ArtifactRef = {
      id: 'mermaid-cache',
      label: '图表缓存',
      path: 'docs/180006/prd/analysis.md',
      stage: 'PRD',
      kind: 'markdown',
      exists: true
    };
    const first = mount(ArtifactPreviewShell, {
      props: { artifact, content: '```mermaid\ngraph LR\n cache-unique-a --> B\n```' }
    });
    await flushPromises();
    expect(mermaid.run).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = mount(ArtifactPreviewShell, {
      props: { artifact, content: '```mermaid\ngraph LR\n cache-unique-a --> B\n```' }
    });
    await flushPromises();
    expect(mermaid.run).toHaveBeenCalledTimes(1);
    expect(second.find('svg[data-rendered="true"]').exists()).toBe(true);

    await second.setProps({ content: '```mermaid\ngraph LR\n cache-unique-c --> D\n```' });
    await flushPromises();
    expect(mermaid.run).toHaveBeenCalledTimes(2);
  });

  it('版本快速切换时旧 Mermaid 任务不会覆盖新正文', async () => {
    // 中文说明：旧任务允许自然完成，但 generation 不匹配时不得操作当前 DOM。
    let resolveOld: (() => void) | undefined;
    vi.mocked(mermaid.run)
      .mockImplementationOnce(
        (options?: { nodes?: HTMLElement[] }) =>
          new Promise<void>((resolve) => {
            resolveOld = () => {
              const node = options?.nodes?.[0];
              if (node) node.innerHTML = '<svg data-old="true"></svg>';
              resolve();
            };
          })
      )
      .mockImplementationOnce(async (options?: { nodes?: HTMLElement[] }) => {
        const node = options?.nodes?.[0];
        if (node) node.innerHTML = '<svg data-new="true"></svg>';
      });
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'mermaid-race',
          label: '竞态测试',
          path: 'docs/180007/prd/analysis.md',
          stage: 'PRD',
          kind: 'markdown',
          exists: true
        },
        content: '```mermaid\ngraph LR\n race-old --> B\n```'
      }
    });
    await nextTick();
    await Promise.resolve();
    await wrapper.setProps({ content: '```mermaid\ngraph LR\n race-new --> D\n```' });
    await nextTick();
    await Promise.resolve();
    resolveOld?.();
    await flushPromises();

    expect(wrapper.find('svg[data-new="true"]').exists()).toBe(true);
    expect(wrapper.find('svg[data-old="true"]').exists()).toBe(false);
  });

  it('HTML 精排增强异常时回退 Markdown 预览', async () => {
    // 中文说明：结构增强失败只降级主题，不清空正文。
    const originalQuerySelectorAll = Element.prototype.querySelectorAll;
    const querySpy = vi.spyOn(Element.prototype, 'querySelectorAll').mockImplementation(function querySelectorAll(
      this: Element,
      selectors: string
    ) {
      if (selectors === 'table, blockquote, pre') {
        throw new Error('enhancement failed');
      }
      return originalQuerySelectorAll.call(this, selectors);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warningSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => undefined as any);
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'rich-fallback',
          label: '精排降级',
          path: 'docs/180008/prd/analysis.md',
          stage: 'PRD',
          kind: 'markdown',
          exists: true
        },
        content: '# 降级后正文仍然存在'
      }
    });
    await flushPromises();
    querySpy.mockRestore();

    expect(wrapper.find('.artifact-markdown').classes()).toContain('artifact-markdown--classic');
    expect(wrapper.text()).toContain('降级后正文仍然存在');
    expect(warningSpy).toHaveBeenCalled();
  });

  it('Markdown 解析异常时展示转义纯文本', async () => {
    // 中文说明：解析器异常属于最末级降级，必须保持原始内容可读且不执行脚本。
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => undefined as any);
    const renderSpy = vi.spyOn(MarkdownIt.prototype, 'render').mockImplementationOnce(() => {
      throw new Error('parse failed');
    });
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'markdown-fallback',
          label: '解析降级',
          path: 'docs/180009/prd/analysis.md',
          stage: 'PRD',
          kind: 'markdown',
          exists: true
        },
        content: '<script>fallback-unique</script>'
      }
    });
    await flushPromises();

    expect(wrapper.find('.markdown-render-fallback').exists()).toBe(true);
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>fallback-unique</script>');
    expect(wrapper.find('.artifact-markdown').classes()).toContain('artifact-markdown--classic');
    renderSpy.mockRestore();
  });

  it('固定规模长文档满足正文出现与模式切换预算', async () => {
    // 中文说明：墙钟预算辅以“无请求、无重解析、无 Mermaid 重绘”的确定性断言。
    const content = Array.from({ length: 80 }, (_, index) => `## 章节 ${index}\n\n这是第 ${index} 段固定性能文本。`).join('\n\n');
    const renderSpy = vi.spyOn(MarkdownIt.prototype, 'render');
    const startedAt = performance.now();
    const wrapper = mount(ArtifactPreviewShell, {
      props: {
        artifact: {
          id: 'performance-budget',
          label: '性能预算',
          path: 'docs/180010/prd/analysis.md',
          stage: 'PRD',
          kind: 'markdown',
          exists: true
        },
        content
      }
    });
    await nextTick();
    const readableAt = performance.now() - startedAt;
    const renderCount = renderSpy.mock.calls.length;
    const switchStartedAt = performance.now();
    await wrapper.findAll('.preview-reading-mode button')[1].trigger('click');
    await nextTick();
    const switchDuration = performance.now() - switchStartedAt;

    expect(wrapper.text()).toContain('这是第 79 段固定性能文本');
    expect(readableAt).toBeLessThan(300);
    expect(switchDuration).toBeLessThan(100);
    expect(renderSpy).toHaveBeenCalledTimes(renderCount);
    expect(mermaid.run).not.toHaveBeenCalled();
    renderSpy.mockRestore();
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

  it('已消费批注展示为已解决', () => {
    const wrapper = mount(TechDesignAnnotationPanel, {
      props: {
        annotations: [annotation({ consumedAt: '2026-06-18T08:00:00.000Z', consumedRunId: 'run-design-1' })]
      }
    });

    expect(wrapper.text()).toContain('已解决');
    expect(wrapper.text()).not.toContain('已处理待确认');
    expect(wrapper.text()).toContain('已纳入生成');
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });
});
