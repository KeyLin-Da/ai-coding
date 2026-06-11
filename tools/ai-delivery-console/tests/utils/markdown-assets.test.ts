import { beforeEach, describe, expect, it } from 'vitest';
import { setApiRuntimeConfig } from '../../src/api/runtime';
import { artifactReadUrl, resolveMarkdownAssetPath, rewriteMarkdownImageSources } from '../../src/utils/markdown-assets';

describe('markdown-assets', () => {
  beforeEach(() => {
    setApiRuntimeConfig({ runnerBaseUrl: 'http://runner.example.com' });
  });

  it('按 Markdown 文件所在目录解析相对图片路径', () => {
    expect(resolveMarkdownAssetPath('docs/141846/prd/analysis.md', 'files/screenshots/ranking_main_20260610.png')).toBe(
      'docs/141846/prd/files/screenshots/ranking_main_20260610.png'
    );
    expect(resolveMarkdownAssetPath('docs/141846/technical-design/design_review.md', '../prd/files/screen.png')).toBe(
      'docs/141846/prd/files/screen.png'
    );
    expect(resolveMarkdownAssetPath('docs/141846/prd/analysis.md', '/docs/141846/prd/files/screen.png')).toBe(
      'docs/141846/prd/files/screen.png'
    );
  });

  it('将 Markdown 图片地址重写到 Runner 产物读取接口', () => {
    const html = '<p><img src="files/screenshots/ranking_main_20260610.png" alt="排行榜主页面"></p>';
    const rewritten = rewriteMarkdownImageSources(html, 'docs/141846/prd/analysis.md');

    expect(rewritten).toContain(
      'src="http://runner.example.com/api/artifacts/read?path=docs%2F141846%2Fprd%2Ffiles%2Fscreenshots%2Franking_main_20260610.png"'
    );
    expect(rewritten).toContain('alt="排行榜主页面"');
  });

  it('保留外部图片地址', () => {
    const html = '<img src="https://example.com/screen.png" alt="external">';

    expect(rewriteMarkdownImageSources(html, 'docs/141846/prd/analysis.md')).toBe(html);
    expect(artifactReadUrl('docs/141846/prd/analysis.md')).toBe('http://runner.example.com/api/artifacts/read?path=docs%2F141846%2Fprd%2Fanalysis.md');
  });
});
