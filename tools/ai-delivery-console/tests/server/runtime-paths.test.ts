import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getLegacyHashedRunnerRuntimeRoot,
  getRunRuntimeDir,
  getRunnerRuntimeRoot,
  resolveWorkspaceOrRuntimePath,
  toRuntimePathRef
} from '../../server/services/runtime-paths';

describe('runtime-paths', () => {
  it('使用工作区项目 code 作为运行目录名，不追加路径哈希', () => {
    const workspaceRoot = path.join(os.tmpdir(), 'AI_WORKSPACE', 'opp-b02e12');

    expect(path.basename(getRunnerRuntimeRoot(workspaceRoot))).toBe('opp-b02e12');
  });

  it('允许受控运行目录的绝对路径并拒绝其他工作区外路径', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-runtime-path-'));
    const runtimeFile = path.join(getRunRuntimeDir(workspaceRoot, '164946'), 'tech-design-annotations.md');

    expect(resolveWorkspaceOrRuntimePath(workspaceRoot, runtimeFile)).toBe(runtimeFile);
    expect(() => resolveWorkspaceOrRuntimePath(workspaceRoot, path.join(path.dirname(workspaceRoot), 'outside.md'))).toThrow('路径不在工作区内');
  });

  it('运行时引用在新目录不存在时兼容解析旧哈希目录文件', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-runtime-legacy-'));
    const legacyFile = path.join(getLegacyHashedRunnerRuntimeRoot(workspaceRoot), 'requirements', '164946', 'runs', 'legacy.log');
    await fs.mkdir(path.dirname(legacyFile), { recursive: true });
    await fs.writeFile(legacyFile, 'legacy', 'utf8');

    const runtimeRef = toRuntimePathRef(workspaceRoot, legacyFile);

    expect(resolveWorkspaceOrRuntimePath(workspaceRoot, runtimeRef)).toBe(legacyFile);
  });
});
