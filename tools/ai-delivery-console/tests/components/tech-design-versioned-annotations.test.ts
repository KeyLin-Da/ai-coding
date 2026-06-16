import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { TechDesignAnnotation, TechDesignVersion } from '../../shared/workflow';
import ArtifactVersionDiffDialog from '../../src/components/ArtifactVersionDiffDialog.vue';
import TechDesignAnnotationPanel from '../../src/components/TechDesignAnnotationPanel.vue';
import TechDesignVersionSelector from '../../src/components/TechDesignVersionSelector.vue';
import { applyAnnotationHighlights, createAnnotationAnchor } from '../../src/utils/tech-design-annotations';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    diffTechDesignVersions: vi.fn().mockResolvedValue({
      left: { id: 'git:abc1234', source: 'PUBLISHED', label: 'v1', artifactPath: 'docs/172014/technical-design/design_review.md', readable: true },
      right: { id: 'current', source: 'CURRENT_DRAFT', label: '当前草稿', artifactPath: 'docs/172014/technical-design/design_review.md', readable: true },
      diff: 'diff --git a/design.md b/design.md\n--- a/design.md\n+++ b/design.md\n@@ -1 +1 @@\n-old\n+new\n',
      truncated: false
    })
  }
}));

vi.mock('diff2html/bundles/js/diff2html.min.js', () => ({
  html: vi.fn(() => '<div class="diff-html">diff</div>')
}));

function versions(): TechDesignVersion[] {
  return [
    {
      id: 'current',
      source: 'CURRENT_DRAFT',
      label: '当前草稿',
      artifactPath: 'docs/172014/technical-design/design_review.md',
      readable: true
    },
    {
      id: 'git:abc1234',
      source: 'PUBLISHED',
      label: 'v1',
      artifactPath: 'docs/172014/technical-design/design_review.md',
      commitSha: 'abc1234',
      readable: true
    }
  ];
}

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
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    ...overrides
  };
}

describe('tech design versioned annotation UI', () => {
  it('根据选中文案生成批注锚点并高亮定位', () => {
    document.body.innerHTML = '<article><h1>技术方案</h1><p>需要缓存策略说明。</p></article>';
    const root = document.querySelector('article') as HTMLElement;
    const text = root.querySelector('p')?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 6);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const draft = createAnnotationAnchor(root);
    expect(draft?.selectedText).toBe('缓存策略');

    applyAnnotationHighlights(root, [annotation({ anchor: draft?.anchor, selectedText: draft?.selectedText })], undefined);
    const highlight = root.querySelector('.tech-design-annotation-highlight');
    expect(highlight?.textContent).toBe('缓存策略');
  });

  it('版本选择器展示当前草稿和历史版本', () => {
    const wrapper = mount(TechDesignVersionSelector, {
      props: {
        modelValue: 'current',
        versions: versions()
      }
    });

    expect(wrapper.text()).toContain('当前草稿');
    expect(wrapper.text()).toContain('v1');
    expect(wrapper.text()).toContain('对比版本');
  });

  it('批注面板支持触发收起、定位、标记已解决和删除事件', async () => {
    const wrapper = mount(TechDesignAnnotationPanel, {
      props: {
        annotations: [annotation()]
      },
      global: {
        stubs: {
          ElCheckbox: {
            template: '<label><input type="checkbox" @change="$emit(\'change\', $event.target.checked)" /><slot /></label>'
          }
        }
      }
    });

    expect(wrapper.text()).toContain('补充 Redis key');
    expect(wrapper.text()).not.toContain('历史');
    expect(wrapper.text()).not.toContain('已解决');
    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.findAll('button')[1].trigger('click');
    await wrapper.findAll('button')[2].trigger('click');
    await wrapper.findAll('button')[3].trigger('click');

    expect(wrapper.emitted('collapse')).toBeTruthy();
    expect(wrapper.emitted('locate')?.[0]?.[0]).toMatchObject({ id: 'annotation-1' });
    expect(wrapper.emitted('resolve')?.[0]?.[0]).toMatchObject({ id: 'annotation-1' });
    expect(wrapper.emitted('delete')?.[0]?.[0]).toMatchObject({ id: 'annotation-1' });
  });

  it('版本 diff 弹窗打开时自动请求版本对比', async () => {
    const wrapper = mount(ArtifactVersionDiffDialog);

    (wrapper.vm as any).open('172014', versions(), 'current');
    await nextTick();
    await Promise.resolve();

    expect(apiClient.diffTechDesignVersions).toHaveBeenCalledWith('172014', {
      leftVersionId: 'git:abc1234',
      rightVersionId: 'current'
    });
  });
});
