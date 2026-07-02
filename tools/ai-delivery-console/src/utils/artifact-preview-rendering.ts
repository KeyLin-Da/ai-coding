export interface BoundedTextCacheOptions {
  maxEntries: number;
  maxCharacters: number;
}

export interface SafeMarkdownRenderResult {
  html: string;
  cacheKey: string;
  fromCache: boolean;
  degraded: boolean;
  error?: unknown;
}

export class BoundedTextCache {
  private readonly entries = new Map<string, string>();
  private totalCharacters = 0;

  constructor(private readonly options: BoundedTextCacheOptions) {}

  get size() {
    return this.entries.size;
  }

  get characterCount() {
    return this.totalCharacters;
  }

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value == null) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    const previous = this.entries.get(key);
    if (previous != null) {
      this.entries.delete(key);
      this.totalCharacters -= previous.length;
    }
    if (value.length > this.options.maxCharacters) {
      return;
    }
    this.entries.set(key, value);
    this.totalCharacters += value.length;
    this.evictOverflow();
  }

  clear(): void {
    this.entries.clear();
    this.totalCharacters = 0;
  }

  private evictOverflow(): void {
    while (this.entries.size > this.options.maxEntries || this.totalCharacters > this.options.maxCharacters) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey == null) {
        return;
      }
      const oldestValue = this.entries.get(oldestKey) || '';
      this.entries.delete(oldestKey);
      this.totalCharacters -= oldestValue.length;
    }
  }
}

export const artifactMarkdownRenderCache = new BoundedTextCache({ maxEntries: 24, maxCharacters: 2_000_000 });
export const artifactMermaidSvgCache = new BoundedTextCache({ maxEntries: 80, maxCharacters: 4_000_000 });

export function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createPreviewCacheKey(namespace: string, value: string, rendererVersion: string): string {
  return `${namespace}:${rendererVersion}:${value.length}:${stableTextHash(value)}`;
}

export function escapePreviewHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdownSafely(input: {
  content: string;
  rendererVersion: string;
  cache: BoundedTextCache;
  render: (content: string) => string;
}): SafeMarkdownRenderResult {
  const cacheKey = createPreviewCacheKey('markdown', input.content, input.rendererVersion);
  try {
    const cached = input.cache.get(cacheKey);
    if (cached != null) {
      return { html: cached, cacheKey, fromCache: true, degraded: false };
    }
  } catch {
    // 缓存失效不应阻断正文渲染，继续直接解析。
  }

  try {
    const html = input.render(input.content);
    try {
      input.cache.set(cacheKey, html);
    } catch {
      // 缓存写入失败时仍返回已渲染正文。
    }
    return { html, cacheKey, fromCache: false, degraded: false };
  } catch (error) {
    return {
      html: `<pre class="markdown-render-fallback"><code>${escapePreviewHtml(input.content)}</code></pre>`,
      cacheKey,
      fromCache: false,
      degraded: true,
      error
    };
  }
}
