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
      right: { id: 'current', source: 'CURRENT_DRAFT', label: 'v2.0 当前草稿', artifactPath: 'docs/172014/technical-design/design_review.md', readable: true },
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
      label: 'v2.0 当前草稿',
      artifactPath: 'docs/172014/technical-design/design_review.md',
      readable: true
    },
    {
      id: 'snapshot:20260624120000-abcdef12',
      source: 'DRAFT_SNAPSHOT',
      label: 'v1.9',
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

  it('正文 hash 一致时按偏移高亮跨节点和空白选区', () => {
    document.body.innerHTML = '<article><p>需要<strong>缓存</strong>\n策略说明。</p></article>';
    const root = document.querySelector('article') as HTMLElement;
    const startText = root.querySelector('strong')?.firstChild as Text;
    const endText = root.querySelector('p')?.lastChild as Text;
    const range = document.createRange();
    range.setStart(startText, 0);
    range.setEnd(endText, 3);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const draft = createAnnotationAnchor(root);
    expect(draft?.selectedText).toBe('缓存 策略');

    applyAnnotationHighlights(root, [annotation({ anchor: draft?.anchor, selectedText: draft?.selectedText, contentHash: 'hash' })], 'hash');
    const highlights = Array.from(root.querySelectorAll('.tech-design-annotation-highlight'));
    expect(highlights).toHaveLength(2);
    expect(highlights.map((item) => item.textContent).join('').replace(/\s+/g, ' ').trim()).toBe('缓存 策略');
  });

  it('跨段批注高亮时跳过 Markdown 结构空白', () => {
    document.body.innerHTML = `
      <article>
        <p>采纳本轮评审意见。</p>
        <ul>
          <li>榜单主页数据接口</li>
          <li>悬浮入口配置接口</li>
        </ul>
      </article>
    `;
    const root = document.querySelector('article') as HTMLElement;
    const startText = root.querySelector('p')?.firstChild as Text;
    const listItems = root.querySelectorAll('li');
    const endText = listItems[1].firstChild as Text;
    const range = document.createRange();
    range.setStart(startText, 0);
    range.setEnd(endText, endText.textContent?.length || 0);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const draft = createAnnotationAnchor(root);
    expect(draft?.selectedText).toBe('采纳本轮评审意见。 榜单主页数据接口 悬浮入口配置接口');

    applyAnnotationHighlights(root, [annotation({ anchor: draft?.anchor, selectedText: draft?.selectedText, contentHash: 'hash' })], 'hash');
    const highlights = Array.from(root.querySelectorAll('.tech-design-annotation-highlight'));

    expect(highlights).toHaveLength(3);
    expect(highlights.map((item) => item.textContent)).toEqual(['采纳本轮评审意见。', '榜单主页数据接口', '悬浮入口配置接口']);
    expect(highlights.every((item) => /\S/.test(item.textContent || ''))).toBe(true);
  });

  it('正文存在短横线和空白变体时仍按规范化文本高亮', () => {
    document.body.innerHTML = '<article><h1>【OPP】 <span>F1‑学习积分排行榜</span></h1><p>正文</p></article>';
    const root = document.querySelector('article') as HTMLElement;

    applyAnnotationHighlights(
      root,
      [
        annotation({
          selectedText: 'F1-学习积',
          contentHash: 'old-hash',
          anchor: {
            plainStart: 0,
            plainEnd: 6,
            prefixText: '【OPP】',
            suffixText: '分排行榜',
            headingPath: ['技术方案'],
            occurrence: 1
          }
        })
      ],
      'current-hash'
    );

    const highlight = root.querySelector('.tech-design-annotation-highlight');
    expect(highlight?.textContent).toBe('F1‑学习积');
  });

  it('SVG 文本批注使用背景层高亮且不改写 Mermaid 文案', () => {
    const text = 'PageVO<CourseComponentOptionVO>';
    const selectedText = 'CourseComponentOptionVO';
    const start = text.indexOf(selectedText);
    document.body.innerHTML = `
      <article>
        <svg viewBox="0 0 320 80">
          <g>
            <text x="10" y="32">PageVO&lt;CourseComponentOptionVO&gt;</text>
          </g>
        </svg>
      </article>
    `;
    const root = document.querySelector('article') as HTMLElement;
    const textElement = root.querySelector('text') as SVGTextContentElement;
    Object.defineProperty(textElement, 'getNumberOfChars', {
      value: () => text.length
    });
    Object.defineProperty(textElement, 'getExtentOfChar', {
      value: (index: number) =>
        ({
          x: 10 + index * 8,
          y: 18,
          width: 8,
          height: 16
        }) as DOMRect
    });

    applyAnnotationHighlights(
      root,
      [
        annotation({
          id: 'annotation-svg',
          selectedText,
          anchor: {
            plainStart: start,
            plainEnd: start + selectedText.length,
            prefixText: 'PageVO<',
            suffixText: '>',
            headingPath: ['技术方案'],
            occurrence: 1
          }
        })
      ],
      'hash'
    );
    applyAnnotationHighlights(
      root,
      [
        annotation({
          id: 'annotation-svg',
          selectedText,
          anchor: {
            plainStart: start,
            plainEnd: start + selectedText.length,
            prefixText: 'PageVO<',
            suffixText: '>',
            headingPath: ['技术方案'],
            occurrence: 1
          }
        })
      ],
      'hash'
    );

    const svgHighlights = Array.from(root.querySelectorAll('.tech-design-annotation-svg-highlight'));
    expect(svgHighlights).toHaveLength(1);
    expect(svgHighlights[0].getAttribute('data-annotation-id')).toBe('annotation-svg');
    expect(svgHighlights[0].getAttribute('x')).toBe(String(10 + start * 8 - 2));
    expect(root.querySelector('svg span.tech-design-annotation-highlight')).toBeNull();
    expect(root.querySelector('text')?.textContent).toBe(text);
  });

  it('版本选择器展示文档中解析到的评审版本', () => {
    const wrapper = mount(TechDesignVersionSelector, {
      props: {
        modelValue: 'current',
        versions: versions()
      }
    });

    expect(wrapper.text()).toContain('v2.0 当前草稿');
    expect(wrapper.text()).toContain('v1.9');
    expect(wrapper.text()).toContain('对比版本');
  });

  it('版本选择器支持隐藏对比按钮', () => {
    const wrapper = mount(TechDesignVersionSelector, {
      props: {
        modelValue: 'current',
        versions: versions(),
        showCompare: false
      }
    });

    expect(wrapper.text()).not.toContain('对比版本');
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
    await wrapper.find('button[title="收起批注"]').trigger('click');
    await wrapper.find('button[title="定位批注"]').trigger('click');
    await wrapper.find('button[title="标记已解决"]').trigger('click');
    await wrapper.find('button[title="删除批注"]').trigger('click');

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
      leftVersionId: 'snapshot:20260624120000-abcdef12',
      rightVersionId: 'current'
    });
  });
});
