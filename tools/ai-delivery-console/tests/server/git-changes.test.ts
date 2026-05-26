import { describe, expect, it } from 'vitest';
import { parseGitStatusShort } from '../../server/services/git-changes';

describe('git-changes', () => {
  it('解析 git status --short 输出', () => {
    const files = parseGitStatusShort([' M src/a.ts', 'A  src/b.ts', '?? docs/new.md', 'R  old.ts -> src/new.ts'].join('\n'));

    expect(files).toEqual([
      { path: 'src/a.ts', status: 'M', staged: false, unstaged: true },
      { path: 'src/b.ts', status: 'A', staged: true, unstaged: false },
      { path: 'docs/new.md', status: '??', staged: false, unstaged: true },
      { path: 'src/new.ts', status: 'R', staged: true, unstaged: false }
    ]);
  });
});
