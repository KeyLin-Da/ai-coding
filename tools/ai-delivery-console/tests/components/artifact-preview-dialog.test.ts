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
  function readBlobText(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  function mockDownloadLink() {
    const clickedAnchors: HTMLAnchorElement[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });
    const createObjectURL = vi.fn(() => 'blob:artifact-download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    return {
      clickSpy,
      createObjectURL,
      revokeObjectURL,
      clickedAnchor: () => clickedAnchors[clickedAnchors.length - 1]
    };
  }

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
    vi.useRealTimers();
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
    }, 42);
    await nextTick();

    expect(wrapper.text()).toContain('PRD 分析文档');
    expect(wrapper.text()).toContain('docs/172014/prd/analysis.md');
    expect(wrapper.find('.artifact-markdown h1').text()).toBe('PRD');
    expect(wrapper.text()).toContain('产物内容');
    expect(wrapper.find('.artifact-markdown img').attributes('src')).toBe(
      '/runner-api/api/artifacts/read?path=docs%2F172014%2Fprd%2Ffiles%2Fscreenshots%2Franking_main_20260610.png&projectId=42&centerBaseUrl=http%3A%2F%2F127.0.0.1%3A8728'
    );
    expect(apiClient.readArtifact).toHaveBeenCalledWith('docs/172014/prd/analysis.md', 42);
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

  it('时序图支持单图局部缩放且不影响其他图和整篇预览', async () => {
    vi.mocked(apiClient.readArtifact).mockResolvedValueOnce({
      artifact: { hash: 'hash' },
      content: `# 技术方案

\`\`\`mermaid
sequenceDiagram
    A->>B: 第一张请求
\`\`\`

\`\`\`mermaid
graph TD
    A[开始] --> B[结束]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    C->>D: 第二张请求
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

    const sequenceDiagrams = wrapper.findAll('.mermaid-sequence-diagram');
    expect(sequenceDiagrams).toHaveLength(2);
    expect(wrapper.findAll('[data-sequence-zoom-toolbar="true"]')).toHaveLength(2);
    expect(wrapper.find('.mermaid-diagram[data-mermaid-type="default"] [data-sequence-zoom-toolbar="true"]').exists()).toBe(false);
    expect(sequenceDiagrams[0].find('[data-sequence-zoom-percent="true"]').text()).toBe('100%');
    expect(sequenceDiagrams[1].find('[data-sequence-zoom-percent="true"]').text()).toBe('100%');

    await sequenceDiagrams[0].find('[data-sequence-zoom-action="in"]').trigger('click');
    await nextTick();

    expect(sequenceDiagrams[0].find('[data-sequence-zoom-percent="true"]').text()).toBe('110%');
    expect(sequenceDiagrams[1].find('[data-sequence-zoom-percent="true"]').text()).toBe('100%');
    expect(wrapper.find('.zoom-percent').text()).toBe('100%');
    const firstSvgStyle = sequenceDiagrams[0].find('svg').attributes('style');
    const secondSvgStyle = sequenceDiagrams[1].find('svg').attributes('style');
    expect(firstSvgStyle).toContain('width: 2530px');
    expect(firstSvgStyle).toContain('min-width: 2530px');
    expect(firstSvgStyle).toContain('max-width: none');
    expect(secondSvgStyle).toContain('max-width: 100%');

    await sequenceDiagrams[0].find('[data-sequence-zoom-action="reset"]').trigger('click');
    await nextTick();

    expect(sequenceDiagrams[0].find('[data-sequence-zoom-percent="true"]').text()).toBe('100%');
    expect(sequenceDiagrams[0].find('svg').attributes('style')).toContain('max-width: 100%');
  });

  it('下载 Markdown 使用需求编号和时间戳命名，并导出当前正文', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 16, 8, 9, 10));
    const downloadMock = mockDownloadLink();
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

    await (wrapper.vm as any).downloadMarkdownArtifact('markdown');

    expect(downloadMock.clickedAnchor()?.download).toBe('172014_20260616080910_PRD_分析文档.md');
    const blob = downloadMock.createObjectURL.mock.calls[0][0] as Blob;
    vi.useRealTimers();
    await expect(readBlobText(blob)).resolves.toContain('# PRD');
  });

  it('下载 HTML 使用已渲染预览内容保留 Mermaid SVG', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 16, 8, 9, 10));
    const downloadMock = mockDownloadLink();
    vi.mocked(apiClient.readArtifact).mockResolvedValueOnce({
      artifact: { hash: 'hash' },
      content: `# 技术方案

\`\`\`mermaid
sequenceDiagram
    A->>B: 请求
\`\`\`
`
    });
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'technical-design',
      stage: 'TECH_DESIGN',
      label: '技术方案评审文档',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();
    await flushPromises();

    await (wrapper.vm as any).downloadMarkdownArtifact('html');

    expect(downloadMock.clickedAnchor()?.download).toBe('172014_20260616080910_技术方案评审文档.html');
    const blob = downloadMock.createObjectURL.mock.calls[0][0] as Blob;
    vi.useRealTimers();
    const html = await readBlobText(blob);
    expect(html).toContain('<svg');
    expect(html).not.toContain('sequenceDiagram');
  });

  it('下载 PDF 打开含渲染内容的打印窗口', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 16, 8, 9, 10));
    vi.mocked(apiClient.readArtifact).mockResolvedValueOnce({
      artifact: { hash: 'hash' },
      content: `# 技术方案

\`\`\`mermaid
sequenceDiagram
    A->>B: 请求
\`\`\`
`
    });
    const write = vi.fn();
    const printWindow = {
      document: {
        open: vi.fn(),
        write,
        close: vi.fn()
      },
      focus: vi.fn(),
      print: vi.fn()
    };
    vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);
    const wrapper = mount(ArtifactPreviewDialog);

    await (wrapper.vm as any).open({
      id: 'technical-design',
      stage: 'TECH_DESIGN',
      label: '技术方案评审文档',
      path: 'docs/172014/prd/analysis.md',
      kind: 'markdown',
      exists: true
    });
    await nextTick();
    await flushPromises();

    await (wrapper.vm as any).downloadMarkdownArtifact('pdf');

    const html = write.mock.calls[0][0] as string;
    expect(html).toContain('<title>172014_20260616080910_技术方案评审文档</title>');
    expect(html).toContain('<svg');
    expect(printWindow.print).toHaveBeenCalled();
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
      '/runner-api/api/artifacts/read?path=docs%2F141846%2Ftechnical-design%2Ffile%2Fscreenshot.png&projectId=5&clientSessionId=16&userId=1&centerBaseUrl=http%3A%2F%2Fcenter.example.com'
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
