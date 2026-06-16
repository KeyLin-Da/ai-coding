import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ArtifactPreviewDialog from '../../src/components/ArtifactPreviewDialog.vue';
import { setApiRuntimeConfig } from '../../src/api/runtime';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    readArtifact: vi.fn().mockResolvedValue({
      artifact: { hash: 'hash' },
      content: '# PRD\n\n产物内容\n\n![排行榜主页面](files/screenshots/ranking_main_20260610.png)'
    })
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
});
