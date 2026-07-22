import type { PrdSourceFile, SupplementBlock, SupplementComposerValue, SupplementFileBlock, SupplementFileContextRole } from '@shared/workflow';

export type SupplementFileLike = Pick<PrdSourceFile, 'id' | 'name' | 'path' | 'size'> &
  Partial<Pick<PrdSourceFile, 'mimeType' | 'uploadedAt'>>;

export function createSupplementBlockId(prefix = 'supplement-block'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isSupplementImageFile(file: { name?: string; path?: string; mimeType?: string; type?: string }): boolean {
  const mimeType = String(file.mimeType || file.type || '').toLowerCase();
  const path = `${file.name || ''} ${file.path || ''}`.toLowerCase();
  return mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(path);
}

export function inferSupplementFileContextRole(file: { name?: string; contextRole?: SupplementFileContextRole }): SupplementFileContextRole {
  if (file.contextRole === 'INLINE' || file.contextRole === 'ATTACHMENT') {
    return file.contextRole;
  }
  return /^pasted-/i.test(String(file.name || '')) ? 'INLINE' : 'ATTACHMENT';
}

export function textToSupplementBlocks(text?: string): SupplementBlock[] {
  const value = (text || '').trim();
  if (!value) {
    return [];
  }
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      id: createSupplementBlockId('paragraph'),
      type: 'PARAGRAPH' as const,
      text: part
    }));
}

export function fileToSupplementBlock(file: SupplementFileLike): SupplementFileBlock {
  return {
    id: createSupplementBlockId(isSupplementImageFile(file) ? 'image' : 'file'),
    type: isSupplementImageFile(file) ? 'IMAGE' : 'FILE',
    fileId: file.id,
    name: file.name,
    path: file.path,
    size: file.size,
    mimeType: file.mimeType,
    uploadedAt: file.uploadedAt,
    contextRole: 'ATTACHMENT',
    status: 'READY'
  };
}

export function filesToSupplementBlocks(files?: SupplementFileLike[]): SupplementBlock[] {
  return (files || []).filter((file) => Boolean(file.path || file.id)).map(fileToSupplementBlock);
}

export function normalizeSupplementBlocks(blocks?: SupplementBlock[]): SupplementBlock[] {
  const normalized: SupplementBlock[] = [];
  const seenFileKeys = new Set<string>();

  for (const block of blocks || []) {
    if (block.type === 'PARAGRAPH') {
      const text = block.text.trim();
      if (text) {
        normalized.push({ ...block, text });
      }
      continue;
    }

    const key = block.path || block.fileId || block.id;
    if (block.status === 'READY' && !block.path) {
      continue;
    }
    if (key && seenFileKeys.has(key)) {
      continue;
    }
    if (key) {
      seenFileKeys.add(key);
    }
    normalized.push({
      ...block,
      contextRole: inferSupplementFileContextRole(block),
      status: block.status || 'READY'
    });
  }

  return normalized;
}

export function buildSupplementBlocks(input: {
  blocks?: SupplementBlock[];
  text?: string;
  files?: SupplementFileLike[];
}): SupplementBlock[] {
  const hasExplicitBlocks = Array.isArray(input.blocks);
  const normalizedBlocks = normalizeSupplementBlocks(input.blocks);
  if (!hasExplicitBlocks) {
    return [...textToSupplementBlocks(input.text), ...filesToSupplementBlocks(input.files)];
  }
  if (!normalizedBlocks.length) {
    return [];
  }

  const existingFileKeys = new Set(
    normalizedBlocks
      .filter((block): block is SupplementFileBlock => block.type === 'IMAGE' || block.type === 'FILE')
      .flatMap((block) => [block.fileId, block.path])
      .filter(Boolean)
  );
  const missingFileBlocks = filesToSupplementBlocks(input.files).filter((block) => !existingFileKeys.has(block.fileId) && !existingFileKeys.has(block.path));
  return [...normalizedBlocks, ...missingFileBlocks];
}

export function exportSupplementMarkdown(blocks?: SupplementBlock[]): string {
  return normalizeSupplementBlocks(blocks)
    .map((block) => {
      if (block.type === 'PARAGRAPH') {
        return block.text.trim();
      }

      if (block.status === 'UPLOADING') {
        return `[${block.type === 'IMAGE' ? '图片' : '文件'}上传中: ${block.name}]`;
      }
      if (block.status === 'FAILED') {
        return `[${block.type === 'IMAGE' ? '图片' : '文件'}上传失败: ${block.name}${block.error ? `，${block.error}` : ''}]`;
      }

      if (block.type === 'IMAGE') {
        const alt = (block.caption || block.name || '补充图片').replace(/\]/g, '\\]');
        return `![${alt}](${block.path})`;
      }

      const label = (block.name || block.caption || '补充文件').replace(/\]/g, '\\]');
      const fileLink = `[补充文件: ${label}](${block.path})`;
      return block.caption ? `${fileLink}\n${block.caption.trim()}` : fileLink;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function extractSupplementSourceFiles(blocks?: SupplementBlock[]): string[] {
  const paths = new Set<string>();
  for (const block of normalizeSupplementBlocks(blocks)) {
    if (
      (block.type === 'IMAGE' || block.type === 'FILE')
      && block.contextRole !== 'INLINE'
      && block.status !== 'FAILED'
      && block.status !== 'UPLOADING'
      && block.path
    ) {
      paths.add(block.path);
    }
  }
  return Array.from(paths);
}

export function buildSupplementComposerValue(blocks?: SupplementBlock[]): SupplementComposerValue {
  const normalizedBlocks = normalizeSupplementBlocks(blocks);
  return {
    blocks: normalizedBlocks,
    markdown: exportSupplementMarkdown(normalizedBlocks),
    sourceFiles: extractSupplementSourceFiles(normalizedBlocks)
  };
}

export function isSupplementComposerEmpty(blocks?: SupplementBlock[]): boolean {
  const value = buildSupplementComposerValue(blocks);
  return !value.markdown.trim() && value.sourceFiles.length === 0;
}
