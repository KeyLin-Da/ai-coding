import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
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
});
