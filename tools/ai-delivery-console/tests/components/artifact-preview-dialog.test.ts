import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ArtifactPreviewDialog from '../../src/components/ArtifactPreviewDialog.vue';

vi.mock('@/api/client', () => ({
  apiClient: {
    readArtifact: vi.fn().mockResolvedValue({
      artifact: { hash: 'hash' },
      content: '# PRD\n\n产物内容'
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
  });

  it('打开已生成 Markdown 文件并展示全屏预览内容', async () => {
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

    expect(wrapper.text()).toContain('PRD 分析文档');
    expect(wrapper.text()).toContain('docs/172014/prd/analysis.md');
    expect(wrapper.html()).toContain('<h1>PRD</h1>');
    expect(wrapper.text()).toContain('产物内容');
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
});
