import { describe, expect, it } from 'vitest';
import { extractFileDiff, extractFileDiffSections, extractFilesDiff, findFirstChangedNewLine } from '../../src/utils/git-file-tree';

describe('git-file-tree diff utilities', () => {
  it('提取同一文件的多段 diff section，避免 staged 和 unstaged 同文件时只展示第一段', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 111..222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+staged',
      'diff --git a/src/b.ts b/src/b.ts',
      'index 111..222 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1 +1 @@',
      '-old',
      '+other',
      'diff --git a/src/a.ts b/src/a.ts',
      'index 222..333 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -3 +3 @@',
      '-staged',
      '+unstaged'
    ].join('\n');

    const sections = extractFileDiffSections(diff, 'src/a.ts');

    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('+staged');
    expect(sections[1]).toContain('+unstaged');
    expect(extractFileDiff(diff, 'src/a.ts')).toContain('+staged');
    expect(extractFilesDiff(diff, ['src/a.ts'])).toContain('+unstaged');
  });

  it('匹配 rename diff 的旧路径和新路径，保证文件改名场景可定位', () => {
    const diff = [
      'diff --git a/src/old-name.ts b/src/new-name.ts',
      'similarity index 87%',
      'rename from src/old-name.ts',
      'rename to src/new-name.ts',
      '--- a/src/old-name.ts',
      '+++ b/src/new-name.ts',
      '@@ -10,3 +10,4 @@',
      ' export const value = 1;',
      '+export const next = 2;'
    ].join('\n');

    expect(extractFileDiffSections(diff, 'src/old-name.ts')).toHaveLength(1);
    expect(extractFileDiffSections(diff, 'src/new-name.ts')).toHaveLength(1);
  });

  it('从 hunk 中推导完整文件预览的首个变更新行号', () => {
    const addedDiff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -34,6 +34,7 @@ export function demo() {',
      ' const keep = true;',
      '+const next = true;'
    ].join('\n');
    const deletedOnlyDiff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -700,4 +700,3 @@ export function demo() {',
      '-const removed = true;',
      ' const keep = true;'
    ].join('\n');

    expect(findFirstChangedNewLine(addedDiff)).toBe(35);
    expect(findFirstChangedNewLine(deletedOnlyDiff)).toBe(700);
  });
});
