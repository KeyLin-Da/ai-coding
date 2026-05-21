import fs from 'node:fs/promises';
import type { ArtifactRef } from '../../shared/workflow';
import { assertInsideWorkspace, hashContent, toRelativePath } from './workspace';

export interface ArtifactContent {
  artifact: ArtifactRef;
  content: string;
}

export async function readArtifact(workspaceRoot: string, filePath: string): Promise<ArtifactContent> {
  const absolute = assertInsideWorkspace(workspaceRoot, filePath);
  const content = await fs.readFile(absolute, 'utf8');
  const stat = await fs.stat(absolute);
  const relative = toRelativePath(workspaceRoot, absolute);
  return {
    artifact: {
      id: relative,
      stage: 'PRD',
      label: relative,
      path: relative,
      kind: relative.endsWith('.html') ? 'html' : 'markdown',
      exists: true,
      hash: hashContent(content),
      updatedAt: stat.mtime.toISOString()
    },
    content
  };
}

export async function saveArtifact(workspaceRoot: string, filePath: string, content: string, expectedHash?: string): Promise<ArtifactContent> {
  const absolute = assertInsideWorkspace(workspaceRoot, filePath);
  const previous = await fs.readFile(absolute, 'utf8').catch(() => '');
  const previousHash = hashContent(previous);
  if (expectedHash && previousHash !== expectedHash) {
    const error = new Error('文件已被外部修改，请刷新后合并差异');
    (error as any).code = 'ARTIFACT_CONFLICT';
    (error as any).currentHash = previousHash;
    throw error;
  }
  await fs.writeFile(absolute, content, 'utf8');
  return readArtifact(workspaceRoot, absolute);
}
