import { describe, expect, it } from 'vitest';
import { assertPreviewableArtifactPath, resolvePublicAssetPath } from '../../server/services/artifact-share-paths';

describe('artifact share paths', () => {
  it('允许受控产物路径', () => {
    expect(assertPreviewableArtifactPath('172014', 'docs/172014/technical-design/design_review.md')).toBe(
      'docs/172014/technical-design/design_review.md'
    );
    expect(assertPreviewableArtifactPath('172014', 'openspec/changes/req-172014/tasks.md')).toBe('openspec/changes/req-172014/tasks.md');
  });

  it('拒绝路径穿越、workflow 和运行日志', () => {
    expect(() => assertPreviewableArtifactPath('172014', '../secret.md')).toThrow('分享产物路径不允许访问');
    expect(() => assertPreviewableArtifactPath('172014', 'docs/172014/workflow/state.json')).toThrow('分享产物路径不允许访问');
    expect(() => assertPreviewableArtifactPath('172014', 'docs/172014/reports/run-abc.log')).toThrow('分享产物路径不允许访问');
  });

  it('公开资产只能解析到受控目录下的安全资源', () => {
    expect(resolvePublicAssetPath('172014', 'docs/172014/technical-design/design_review.md', '../prd/files/screen.png')).toBe(
      'docs/172014/prd/files/screen.png'
    );
    expect(() => resolvePublicAssetPath('172014', 'docs/172014/technical-design/design_review.md', '../../workflow/state.json')).toThrow(
      '分享产物路径不允许访问'
    );
    expect(() => resolvePublicAssetPath('172014', 'docs/172014/technical-design/design_review.md', 'https://example.com/a.png')).toThrow(
      '分享资源路径不允许访问'
    );
  });
});
