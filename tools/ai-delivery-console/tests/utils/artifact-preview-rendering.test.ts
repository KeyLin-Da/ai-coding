import { describe, expect, it, vi } from 'vitest';
import {
  BoundedTextCache,
  createPreviewCacheKey,
  renderMarkdownSafely,
  stableTextHash
} from '../../src/utils/artifact-preview-rendering';

describe('artifact preview rendering utilities', () => {
  it('按条目数和字符数淘汰最久未使用的缓存', () => {
    // 中文说明：命中缓存会刷新其最近使用顺序，超限时只淘汰最旧条目。
    const cache = new BoundedTextCache({ maxEntries: 2, maxCharacters: 8 });
    cache.set('a', '1111');
    cache.set('b', '22');
    expect(cache.get('a')).toBe('1111');
    cache.set('c', '33');

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1111');
    expect(cache.get('c')).toBe('33');
    expect(cache.size).toBe(2);
    expect(cache.characterCount).toBe(6);
  });

  it('超出字符总上限的单个值不进入缓存', () => {
    // 中文说明：避免异常大文档挤占整个预览缓存。
    const cache = new BoundedTextCache({ maxEntries: 3, maxCharacters: 4 });
    cache.set('large', '12345');
    expect(cache.size).toBe(0);
  });

  it('稳定缓存键同时包含命名空间、渲染版本、长度和内容摘要', () => {
    // 中文说明：内容或渲染器版本变化都必须使缓存失效。
    expect(stableTextHash('相同内容')).toBe(stableTextHash('相同内容'));
    expect(createPreviewCacheKey('markdown', '内容 A', 'v1')).not.toBe(createPreviewCacheKey('markdown', '内容 B', 'v1'));
    expect(createPreviewCacheKey('markdown', '内容 A', 'v1')).not.toBe(createPreviewCacheKey('markdown', '内容 A', 'v2'));
  });

  it('安全 Markdown 渲染会复用缓存并避免重复解析', () => {
    // 中文说明：相同内容再次读取时直接复用基础 HTML。
    const cache = new BoundedTextCache({ maxEntries: 3, maxCharacters: 1000 });
    const render = vi.fn((content: string) => `<h1>${content}</h1>`);
    const first = renderMarkdownSafely({ content: '标题', rendererVersion: 'v1', cache, render });
    const second = renderMarkdownSafely({ content: '标题', rendererVersion: 'v1', cache, render });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.html).toBe('<h1>标题</h1>');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('Markdown 解析异常时返回转义纯文本而不是空白页面', () => {
    // 中文说明：原始脚本必须作为文本显示，不能进入可信 DOM 执行。
    const cache = new BoundedTextCache({ maxEntries: 3, maxCharacters: 1000 });
    const result = renderMarkdownSafely({
      content: '<script>window.hacked = true</script>',
      rendererVersion: 'v1',
      cache,
      render: () => {
        throw new Error('parse failed');
      }
    });

    expect(result.degraded).toBe(true);
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).not.toContain('<script>');
  });
});
