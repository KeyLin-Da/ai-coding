import { beforeEach, describe, expect, it } from 'vitest';
import { setApiRuntimeConfig } from '../../src/api/runtime';
import { artifactReadUrl, publicArtifactAssetUrl, resolveMarkdownAssetPath, rewriteMarkdownImageSources } from '../../src/utils/markdown-assets';

describe('markdown-assets', () => {
  beforeEach(() => {
    setApiRuntimeConfig({
      runnerBaseUrl: 'http://runner.example.com',
      centerBaseUrl: 'http://center.example.com',
      userId: '',
      projectId: '',
      clientSessionId: ''
    });
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
      'src="/runner-api/api/artifacts/read?path=docs%2F141846%2Fprd%2Ffiles%2Fscreenshots%2Franking_main_20260610.png"'
    );
    expect(rewritten).toContain('alt="排行榜主页面"');
  });

  it('保留外部图片地址', () => {
    const html = '<img src="https://example.com/screen.png" alt="external">';

    expect(rewriteMarkdownImageSources(html, 'docs/141846/prd/analysis.md')).toBe(html);
    expect(artifactReadUrl('docs/141846/prd/analysis.md')).toBe('/runner-api/api/artifacts/read?path=docs%2F141846%2Fprd%2Fanalysis.md');
  });

  it('产物读取 URL 携带项目运行时上下文以支持图片标签直连', () => {
    setApiRuntimeConfig({
      centerBaseUrl: 'http://center.example.com',
      userId: '1',
      projectId: '5',
      clientSessionId: '16'
    });

    expect(artifactReadUrl('docs/141846/technical-design/file/screenshot.png')).toBe(
      '/runner-api/api/artifacts/read?path=docs%2F141846%2Ftechnical-design%2Ffile%2Fscreenshot.png&projectId=5&clientSessionId=16&userId=1&centerBaseUrl=http%3A%2F%2Fcenter.example.com'
    );
  });

  it('显式项目 ID 优先于全局运行时项目上下文', () => {
    setApiRuntimeConfig({
      centerBaseUrl: 'http://center.example.com',
      userId: '1',
      projectId: '5',
      clientSessionId: '16'
    });

    expect(artifactReadUrl('docs/141846/technical-design/file/screenshot.png', 42)).toBe(
      '/runner-api/api/artifacts/read?path=docs%2F141846%2Ftechnical-design%2Ffile%2Fscreenshot.png&projectId=42&clientSessionId=16&userId=1&centerBaseUrl=http%3A%2F%2Fcenter.example.com'
    );
  });

  it('公开分享图片地址改写到公开 assets 接口', () => {
    const html = '<img src="files/screen.png" alt="screen">';
    const rewritten = rewriteMarkdownImageSources(
      html,
      'docs/141846/prd/analysis.md',
      (assetPath) => publicArtifactAssetUrl('share-token', assetPath)
    );

    expect(rewritten).toContain(
      'src="/runner-api/api/ai-delivery/public-artifact-shares/share-token/assets?path=docs%2F141846%2Fprd%2Ffiles%2Fscreen.png"'
    );
  });
});
