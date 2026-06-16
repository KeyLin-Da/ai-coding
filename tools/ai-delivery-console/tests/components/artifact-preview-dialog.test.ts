import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ArtifactPreviewDialog from '../../src/components/ArtifactPreviewDialog.vue';
import { setApiRuntimeConfig } from '../../src/api/runtime';
import { apiClient } from '@/api/client';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn(async (options?: { nodes?: HTMLElement[] }) => {
      const nodes = options?.nodes?.length ? options.nodes : Array.from(document.querySelectorAll<HTMLElement>('.mermaid'));
      nodes.forEach((node) => {
        if (node.querySelector('svg')) {
          return;
        }
        node.innerHTML = '<svg viewBox="0 0 1200 600" width="100%" height="600" style="max-width: 1200px;"></svg>';
      });
    })
  }
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    readArtifact: vi.fn().mockResolvedValue({
      artifact: { hash: 'hash' },
      content: '# PRD\n\n产物内容\n\n![排行榜主页面](files/screenshots/ranking_main_20260610.png)'
    }),
    listTechDesignVersions: vi.fn().mockResolvedValue({
      versions: [
        {
          id: 'current',
          source: 'CURRENT_DRAFT',
          label: '当前草稿',
          artifactPath: 'docs/172014/technical-design/design_review.md',
          contentHash: 'tech-hash',
          readable: true
        }
      ]
    }),
    readTechDesignVersion: vi.fn().mockResolvedValue({
      version: {
        id: 'current',
        source: 'CURRENT_DRAFT',
        label: '当前草稿',
        artifactPath: 'docs/172014/technical-design/design_review.md',
        contentHash: 'tech-hash',
        readable: true
      },
      content: '# 技术方案\n\n需要补充缓存策略。'
    }),
    listTechDesignAnnotations: vi.fn().mockResolvedValue({
      hash: 'annotation-hash',
      summaryPath: 'docs/172014/technical-design/annotations/comments.md',
      annotations: [
        {
          id: 'annotation-1',
          requirementId: '172014',
          artifactPath: 'docs/172014/technical-design/design_review.md',
          versionId: 'current',
          versionSource: 'CURRENT_DRAFT',
          contentHash: 'tech-hash',
          selectedText: '缓存策略',
          anchor: {
            plainStart: 7,
            plainEnd: 11,
            prefixText: '需要补充',
            suffixText: '。',
            headingPath: ['技术方案'],
            occurrence: 1
          },
          comment: '补充 Redis key',
          status: 'OPEN',
          includeInNextGeneration: true,
          createdAt: '2026-06-16T00:00:00.000Z',
          updatedAt: '2026-06-16T00:00:00.000Z'
        }
      ]
    }),
    deleteTechDesignAnnotation: vi.fn()
  }
}));

describe('ArtifactPreviewDialog', () => {
  function mockLocalStorage() {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear())
    };
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    return storage;
  }

  beforeEach(() => {
    mockLocalStorage();
    setApiRuntimeConfig({
      runnerBaseUrl: 'http://127.0.0.1:8718',
      centerBaseUrl: 'http://127.0.0.1:8728',
      userId: '',
      projectId: '',
      clientSessionId: ''
    });
    vi.clearAllMocks();
  });

  it('打开已生成 Markdown 文件并展示全屏预览内容', async () => {
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'prd-analysis',
      stage: 'PRD',
      label: 'PRD 分析文档',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true,
      currentVersionNo: 2,
      versionCount: 4,
      createdBy: 1,
      sourceRunId: 900
    });
    await nextTick();

    expect(wrapper.text()).toContain('PRD 分析文档');
    expect(wrapper.text()).toContain('docs/172014/prd/analysis.md');
    expect(wrapper.html()).toContain('<h1>PRD</h1>');
    expect(wrapper.text()).toContain('产物内容');
    expect(wrapper.find('.artifact-markdown img').attributes('src')).toBe(
      'http://127.0.0.1:8718/api/artifacts/read?path=docs%2F172014%2Fprd%2Ffiles%2Fscreenshots%2Franking_main_20260610.png'
    );
    expect(wrapper.text()).toContain('v2');
    expect(wrapper.text()).toContain('4 个版本');
    expect(wrapper.text()).toContain('run 900');
  });

  it('护眼模式会切换预览样式并持久化偏好', async () => {
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'prd-analysis',
      stage: 'PRD',
      label: 'PRD 分析文档',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();

    expect(wrapper.find('.preview-dialog-body').classes()).not.toContain('eye-care');
    await wrapper.find('.eye-care-toggle input').setValue(true);
    await nextTick();

    expect(wrapper.find('.preview-dialog-body').classes()).toContain('eye-care');
    expect(window.localStorage.getItem('ai-delivery-preview-eye-care')).toBe('1');
  });

  it('支持放大、缩小和重置预览比例', async () => {
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'prd-analysis',
      stage: 'PRD',
      label: 'PRD 分析文档',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();

    expect(wrapper.find('.zoom-percent').text()).toBe('100%');
    expect(wrapper.find('.preview-zoom-stage').attributes('style')).toContain('--preview-zoom-scale: 1');

    await wrapper.find('.zoom-in-button').trigger('click');
    await nextTick();

    expect(wrapper.find('.zoom-percent').text()).toBe('110%');
    expect(wrapper.find('.preview-zoom-stage').attributes('style')).toContain('--preview-zoom-scale: 1.1');

    await wrapper.find('.zoom-out-button').trigger('click');
    await nextTick();

    expect(wrapper.find('.zoom-percent').text()).toBe('100%');

    await wrapper.find('.zoom-in-button').trigger('click');
    await wrapper.find('.zoom-in-button').trigger('click');
    await nextTick();
    expect(wrapper.find('.zoom-percent').text()).toBe('120%');

    await wrapper.find('.zoom-reset-button').trigger('click');
    await nextTick();

    expect(wrapper.find('.zoom-percent').text()).toBe('100%');
  });

  it('时序图默认按预览宽度适配，不强制放大撑开页面', async () => {
    vi.mocked(apiClient.readArtifact).mockResolvedValueOnce({
      artifact: { hash: 'hash' },
      content: `# 技术方案

\`\`\`mermaid
sequenceDiagram
    A->>B: 请求
    B-->>A: 响应
\`\`\`
`
    });
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'prd-analysis',
      stage: 'PRD',
      label: 'PRD 分析文档',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();
    await flushPromises();
    await nextTick();

    const diagram = wrapper.find('.mermaid-sequence-diagram');
    expect(diagram.exists()).toBe(true);
    const svgStyle = diagram.find('svg').attributes('style');
    expect(svgStyle).toContain('max-width: 100%');
    expect(svgStyle).toContain('height: auto');
    expect(svgStyle).not.toContain('min-width: 2160px');
  });

  it('时序图在 200% 细读时会放大图内尺寸', async () => {
    vi.mocked(apiClient.readArtifact).mockResolvedValueOnce({
      artifact: { hash: 'hash' },
      content: `# 技术方案

\`\`\`mermaid
sequenceDiagram
    A->>B: 请求
    B-->>A: 响应
\`\`\`
`
    });
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'prd-analysis',
      stage: 'PRD',
      label: 'PRD 分析文档',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();
    await flushPromises();
    await nextTick();

    for (let index = 0; index < 10; index += 1) {
      await wrapper.find('.zoom-in-button').trigger('click');
    }
    await nextTick();
    await flushPromises();

    expect(wrapper.find('.zoom-percent').text()).toBe('200%');
    const svgStyle = wrapper.find('.mermaid-sequence-diagram svg').attributes('style');
    const width = Number(svgStyle.match(/(?:^|;\s*)width:\s*(\d+)px/)?.[1] || 0);
    const minWidth = Number(svgStyle.match(/min-width:\s*(\d+)px/)?.[1] || 0);
    expect(width).toBeGreaterThan(1200);
    expect(minWidth).toBe(width);
    expect(svgStyle).toContain('max-width: none');
  });

  it('打开图片产物时直接展示图片预览', async () => {
    setApiRuntimeConfig({
      centerBaseUrl: 'http://center.example.com',
      userId: '1',
      projectId: '5',
      clientSessionId: '16'
    });
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'technical-design-source-1',
      stage: 'TECH_DESIGN',
      label: '补充截图',
      path: 'docs/141846/technical-design/file/screenshot.png',
      kind: 'image',
      exists: true
    });
    await nextTick();

    const image = wrapper.find('.artifact-image-wrap img');
    expect(image.exists()).toBe(true);
    expect(image.attributes('src')).toBe(
      'http://127.0.0.1:8718/api/artifacts/read?path=docs%2F141846%2Ftechnical-design%2Ffile%2Fscreenshot.png&projectId=5&clientSessionId=16&userId=1&centerBaseUrl=http%3A%2F%2Fcenter.example.com'
    );
    expect(apiClient.readArtifact).not.toHaveBeenCalled();
  });

  it('技术方案批注面板收起后预览布局不保留右侧列', async () => {
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'technical-design',
      stage: 'TECH_DESIGN',
      label: '技术方案评审文档',
      path: 'docs/172014/technical-design/design_review.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();
    await Promise.resolve();
    await nextTick();

    const layout = wrapper.find('.tech-design-preview-layout');
    expect(layout.exists()).toBe(true);
    expect(layout.classes()).not.toContain('annotation-panel-collapsed');

    const annotationToggle = wrapper.findAll('button').find((button) => button.text().trim() === '批注 1');
    expect(annotationToggle).toBeTruthy();
    await annotationToggle?.trigger('click');
    await nextTick();

    expect(wrapper.find('.tech-design-preview-layout').classes()).toContain('annotation-panel-collapsed');
  });

  it('技术方案当前草稿只展示正文 hash 匹配的批注', async () => {
    (apiClient.listTechDesignAnnotations as any).mockResolvedValueOnce({
      hash: 'annotation-hash',
      summaryPath: 'docs/172014/technical-design/annotations/comments.md',
      annotations: [
        {
          id: 'annotation-old',
          requirementId: '172014',
          artifactPath: 'docs/172014/technical-design/design_review.md',
          versionId: 'current',
          versionSource: 'CURRENT_DRAFT',
          contentHash: 'old-tech-hash',
          selectedText: '旧缓存策略',
          anchor: {
            plainStart: 7,
            plainEnd: 11,
            prefixText: '需要补充',
            suffixText: '。',
            headingPath: ['技术方案'],
            occurrence: 1
          },
          comment: '旧版批注',
          status: 'OPEN',
          includeInNextGeneration: true,
          createdAt: '2026-06-16T00:00:00.000Z',
          updatedAt: '2026-06-16T00:00:00.000Z'
        },
        {
          id: 'annotation-current',
          requirementId: '172014',
          artifactPath: 'docs/172014/technical-design/design_review.md',
          versionId: 'current',
          versionSource: 'CURRENT_DRAFT',
          contentHash: 'tech-hash',
          selectedText: '缓存策略',
          anchor: {
            plainStart: 7,
            plainEnd: 11,
            prefixText: '需要补充',
            suffixText: '。',
            headingPath: ['技术方案'],
            occurrence: 1
          },
          comment: '新版批注',
          status: 'OPEN',
          includeInNextGeneration: true,
          createdAt: '2026-06-16T00:00:00.000Z',
          updatedAt: '2026-06-16T00:00:00.000Z'
        }
      ]
    });
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'technical-design',
      stage: 'TECH_DESIGN',
      label: '技术方案评审文档',
      path: 'docs/172014/technical-design/design_review.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.text()).toContain('批注 1');
    expect(wrapper.text()).toContain('新版批注');
    expect(wrapper.text()).not.toContain('旧版批注');
  });
});
