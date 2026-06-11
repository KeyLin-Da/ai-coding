import { resolveRunnerApiUrl } from '@/api/runtime';

const externalAssetPattern = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function dirname(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index >= 0 ? filePath.slice(0, index) : '';
}

function normalizeWorkspacePath(filePath: string): string {
  const segments: string[] = [];
  for (const segment of filePath.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

export function artifactReadUrl(filePath: string): string {
  return resolveRunnerApiUrl(`/api/artifacts/read?path=${encodeURIComponent(filePath)}`);
}

export function resolveMarkdownAssetPath(markdownPath: string, src: string): string {
  const cleanSrc = src.trim();
  if (!markdownPath || !cleanSrc || externalAssetPattern.test(cleanSrc)) {
    return '';
  }
  const rawPath = cleanSrc.startsWith('/') ? cleanSrc.slice(1) : `${dirname(markdownPath)}/${cleanSrc}`;
  return normalizeWorkspacePath(rawPath);
}

export function rewriteMarkdownImageSources(html: string, markdownPath?: string): string {
  if (!markdownPath) {
    return html;
  }
  return html.replace(/<img([^>]*)src=(["'])(.*?)\2([^>]*)>/gi, (match, before, quote, src, after) => {
    const assetPath = resolveMarkdownAssetPath(markdownPath, src);
    if (!assetPath) {
      return match;
    }
    return `<img${before}src=${quote}${artifactReadUrl(assetPath)}${quote}${after}>`;
  });
}
