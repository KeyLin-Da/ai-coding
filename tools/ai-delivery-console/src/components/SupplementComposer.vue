<template>
  <section
    ref="composerRoot"
    class="supplement-composer"
    :class="{ dragging }"
    tabindex="0"
    aria-label="图文补充输入"
    @paste="handlePaste"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="handleDrop"
  >
    <input ref="fileInput" class="hidden-file-input" type="file" multiple :accept="accept" @change="handleFileInput" />
    <div class="comment-editor-shell">
      <header class="composer-toolbar">
        <span>补充说明</span>
      </header>

      <div class="comment-editor-surface" @click="focusEditorEnd">
        <p v-if="!draftBlocks.length" class="composer-placeholder">{{ placeholder }}</p>
        <div class="comment-flow">
          <article
            v-for="(block, index) in draftBlocks"
            :key="block.id"
            class="comment-node composer-block"
            :class="[`is-${block.type.toLowerCase()}`, `status-${block.status || 'READY'}`]"
            :data-block-index="index"
            :data-block-id="block.id"
            @click.stop="activeBlockIndex = index"
          >
            <template v-if="block.type === 'PARAGRAPH'">
              <textarea
                class="paragraph-editor"
                :value="block.text"
                rows="1"
                role="textbox"
                spellcheck="false"
                :placeholder="paragraphPlaceholder"
                @focus="activeBlockIndex = index"
                @input="updateParagraph(index, $event)"
                @keydown.backspace="handleParagraphBackspace(index, $event)"
              ></textarea>
            </template>

            <template v-else-if="block.type === 'IMAGE'">
              <figure class="comment-embed image-embed">
                <div class="asset-preview image-preview">
                  <img v-if="imagePreviewSrc(block) && block.status !== 'FAILED'" :src="imagePreviewSrc(block)" :alt="block.name" />
                  <el-icon v-else><Picture /></el-icon>
                  <span v-if="block.status === 'UPLOADING'" class="status-pill">上传中</span>
                  <span v-else-if="block.status === 'FAILED'" class="status-pill error">上传失败</span>
                </div>
                <figcaption class="embed-meta">
                  <div class="asset-title-row">
                    <strong :title="block.name">{{ block.name }}</strong>
                    <span>{{ formatFileSize(block.size) }}</span>
                  </div>
                  <input
                    class="caption-input"
                    :value="block.caption || ''"
                    placeholder="补充图片说明"
                    @input="updateCaption(index, $event)"
                  />
                  <p v-if="block.status === 'FAILED'" class="status-text error">{{ block.error || '上传失败，请重试或移除。' }}</p>
                </figcaption>
                <div class="asset-actions">
                  <a v-if="block.path" class="icon-action" :href="filePreviewUrl(block)" target="_blank" rel="noreferrer" aria-label="预览文件">
                    <el-icon><View /></el-icon>
                  </a>
                  <button
                    v-if="block.status === 'FAILED'"
                    type="button"
                    class="icon-action"
                    aria-label="重试上传"
                    @click.stop="retryUpload(index)"
                  >
                    <el-icon><Refresh /></el-icon>
                  </button>
                  <button type="button" class="icon-action danger" aria-label="从本次补充移除" @click.stop="removeBlock(index)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </figure>
            </template>

            <template v-else>
              <div class="comment-file-chip">
                <div class="file-badge">{{ fileExtension(block) }}</div>
                <div class="asset-main">
                  <div class="asset-title-row">
                    <strong :title="block.name">{{ block.name }}</strong>
                    <span>{{ formatFileSize(block.size) }}</span>
                  </div>
                  <input class="caption-input" :value="block.caption || ''" placeholder="补充文件说明" @input="updateCaption(index, $event)" />
                  <p v-if="block.status === 'UPLOADING'" class="status-text">上传中...</p>
                  <p v-else-if="block.status === 'FAILED'" class="status-text error">{{ block.error || '上传失败，请重试或移除。' }}</p>
                </div>
                <div class="asset-actions">
                  <a v-if="block.path" class="icon-action" :href="filePreviewUrl(block)" target="_blank" rel="noreferrer" aria-label="预览文件">
                    <el-icon><View /></el-icon>
                  </a>
                  <button
                    v-if="block.status === 'FAILED'"
                    type="button"
                    class="icon-action"
                    aria-label="重试上传"
                    @click.stop="retryUpload(index)"
                  >
                    <el-icon><Refresh /></el-icon>
                  </button>
                  <button type="button" class="icon-action danger" aria-label="从本次补充移除" @click.stop="removeBlock(index)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </div>
            </template>
          </article>
        </div>
      </div>

      <footer class="composer-footer">
        <div class="footer-hint">
          <span>可直接复制文本和图片到这里，也可以拖入文件。</span>
          <button v-if="draftBlocks.length" type="button" class="clear-all-action" aria-label="清空本次补充" @click.stop="clearAllBlocks">
            清空本次补充
          </button>
        </div>
        <el-button :disabled="uploading" :icon="Upload" @click="fileInput?.click()">上传附件</el-button>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Delete, Picture, Refresh, Upload, View } from '@element-plus/icons-vue';
import type { SupplementBlock, SupplementFileBlock, SupplementFileContextRole } from '@shared/workflow';
import { artifactViewUrl } from '@/utils/markdown-assets';
import {
  buildSupplementComposerValue,
  createSupplementBlockId,
  isSupplementImageFile,
  normalizeSupplementBlocks
} from '@/utils/supplement-composer';

const props = withDefaults(
  defineProps<{
    modelValue?: SupplementBlock[];
    projectId?: string | number;
    placeholder?: string;
    paragraphPlaceholder?: string;
    accept?: string;
    uploading?: boolean;
  }>(),
  {
    modelValue: () => [],
    projectId: undefined,
    placeholder: '添加补充说明、截图或文件。',
    paragraphPlaceholder: '输入补充说明',
    accept: '.pdf,.md,.markdown,image/*',
    uploading: false
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: SupplementBlock[]): void;
  (event: 'change', value: ReturnType<typeof buildSupplementComposerValue>): void;
  (event: 'upload-files', files: File[], insertIndex: number, pendingBlockIds: string[]): void;
}>();

const draftBlocks = ref<SupplementBlock[]>(normalizeSupplementBlocks(props.modelValue));
const fileInput = ref<HTMLInputElement>();
const composerRoot = ref<HTMLElement>();
const dragging = ref(false);
const activeBlockIndex = ref(-1);
const pendingFiles = new Map<string, File>();
const pendingPreviewUrls = new Map<string, string>();
let lastSerializedBlocks = JSON.stringify(draftBlocks.value);
let hadUploadInFlight = props.uploading;

watch(
  () => props.modelValue,
  (value) => {
    const incomingBlocks = value || [];
    const incomingSerialized = JSON.stringify(incomingBlocks);
    if (incomingSerialized === lastSerializedBlocks) {
      return;
    }
    const normalized = normalizeSupplementBlocks(incomingBlocks);
    const serialized = JSON.stringify(normalized);
    syncPendingPreviewUrls(normalized);
    draftBlocks.value = normalized;
    lastSerializedBlocks = serialized;
    void nextTick(resizeAllParagraphEditors);
  },
  { deep: true }
);

watch(
  () => props.uploading,
  (uploading) => {
    if (uploading) {
      hadUploadInFlight = true;
      return;
    }
    if (!hadUploadInFlight) {
      return;
    }
    hadUploadInFlight = false;
    const nextBlocks = draftBlocks.value.map((block) => {
      if ((block.type === 'IMAGE' || block.type === 'FILE') && block.status === 'UPLOADING' && !block.path) {
        return { ...block, status: 'FAILED' as const, error: '上传失败，请重试或移除。' };
      }
      return block;
    });
    replaceBlocks(nextBlocks);
  }
);

onBeforeUnmount(() => {
  pendingPreviewUrls.forEach((url) => revokeObjectUrl(url));
  pendingPreviewUrls.clear();
});

onMounted(() => {
  void nextTick(resizeAllParagraphEditors);
});

function emitChange() {
  const blocks = draftBlocks.value.map((block) => ({ ...block }));
  lastSerializedBlocks = JSON.stringify(blocks);
  emit('update:modelValue', blocks);
  emit('change', buildSupplementComposerValue(blocks));
}

function replaceBlocks(blocks: SupplementBlock[]) {
  draftBlocks.value = blocks;
  emitChange();
}

function insertionIndexFromEvent(event?: Event): number {
  const target = event?.target as HTMLElement | null;
  const blockElement = target?.closest?.('[data-block-index]') as HTMLElement | null;
  if (blockElement?.dataset.blockIndex) {
    return Number(blockElement.dataset.blockIndex) + 1;
  }
  if (activeBlockIndex.value >= 0) {
    return activeBlockIndex.value + 1;
  }
  return draftBlocks.value.length;
}

function insertBlocks(blocks: SupplementBlock[], insertIndex = draftBlocks.value.length) {
  if (!blocks.length) {
    return;
  }
  const safeIndex = Math.max(0, Math.min(insertIndex, draftBlocks.value.length));
  draftBlocks.value.splice(safeIndex, 0, ...blocks);
  activeBlockIndex.value = safeIndex + blocks.length - 1;
  emitChange();
  void nextTick(resizeAllParagraphEditors);
}

function appendParagraph(insertIndex = draftBlocks.value.length) {
  const safeIndex = Math.max(0, Math.min(insertIndex, draftBlocks.value.length));
  insertBlocks([{ id: createSupplementBlockId('paragraph'), type: 'PARAGRAPH', text: '' }], safeIndex);
  void focusParagraph(safeIndex);
}

function focusParagraph(index: number) {
  return nextTick(() => {
    const editor = composerRoot.value?.querySelector<HTMLTextAreaElement>(`[data-block-index="${index}"] .paragraph-editor`);
    if (!editor) {
      return;
    }
    resizeParagraphEditor(editor);
    editor.focus();
    const end = editor.value.length;
    editor.setSelectionRange(end, end);
  });
}

function focusEditorEnd(event?: MouseEvent) {
  const target = event?.target as HTMLElement | null;
  if (target?.closest?.('[data-block-index], button, a, input')) {
    return;
  }

  const lastIndex = draftBlocks.value.length - 1;
  if (lastIndex >= 0) {
    if (draftBlocks.value[lastIndex]?.type === 'PARAGRAPH') {
      activeBlockIndex.value = lastIndex;
      void focusParagraph(lastIndex);
      return;
    }
    appendParagraph(draftBlocks.value.length);
    return;
  }
  appendParagraph();
}

function updateParagraph(index: number, event: Event) {
  const target = event.target as HTMLTextAreaElement;
  const block = draftBlocks.value[index];
  if (!block || block.type !== 'PARAGRAPH') {
    return;
  }
  resizeParagraphEditor(target);
  draftBlocks.value[index] = { ...block, text: target.value };
  emitChange();
}

function handleParagraphBackspace(index: number, event: KeyboardEvent) {
  const block = draftBlocks.value[index];
  if (block?.type !== 'PARAGRAPH' || block.text.trim()) {
    return;
  }
  if (draftBlocks.value.length <= 1) {
    return;
  }
  event.preventDefault();
  removeBlock(index);
}

function updateCaption(index: number, event: Event) {
  const block = draftBlocks.value[index];
  if (!block || block.type === 'PARAGRAPH') {
    return;
  }
  draftBlocks.value[index] = { ...block, caption: (event.target as HTMLInputElement).value };
  emitChange();
}

function removeBlock(index: number) {
  const [removed] = draftBlocks.value.splice(index, 1);
  if (removed && (removed.type === 'IMAGE' || removed.type === 'FILE')) {
    pendingFiles.delete(removed.id);
    revokePendingPreview(removed.id);
  }
  activeBlockIndex.value = Math.min(index, draftBlocks.value.length - 1);
  emitChange();
}

function clearAllBlocks() {
  if (!draftBlocks.value.length) {
    return;
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('确认清空本次补充？')) {
    return;
  }

  draftBlocks.value.forEach((block) => {
    if (block.type === 'IMAGE' || block.type === 'FILE') {
      pendingFiles.delete(block.id);
      revokePendingPreview(block.id);
    }
  });
  pendingFiles.clear();
  activeBlockIndex.value = -1;
  replaceBlocks([]);
}

function createPendingBlock(file: File, contextRole: SupplementFileContextRole): SupplementFileBlock {
  const isImage = isSupplementImageFile(file);
  const id = createSupplementBlockId(isImage ? 'pending-image' : 'pending-file');
  pendingFiles.set(id, file);
  if (isImage) {
    const previewUrl = createObjectUrl(file);
    if (previewUrl) {
      pendingPreviewUrls.set(id, previewUrl);
    }
  }
  return {
    id,
    type: isImage ? 'IMAGE' : 'FILE',
    fileId: id,
    name: file.name,
    path: '',
    size: file.size,
    mimeType: file.type,
    contextRole,
    status: 'UPLOADING'
  };
}

function uploadFiles(files: File[], insertIndex = draftBlocks.value.length, contextRole: SupplementFileContextRole = 'ATTACHMENT') {
  if (!files.length) {
    return;
  }
  const safeIndex = Math.max(0, Math.min(insertIndex, draftBlocks.value.length));
  const pendingBlocks = files.map((file) => createPendingBlock(file, contextRole));
  const shouldAppendParagraph = draftBlocks.value[safeIndex]?.type !== 'PARAGRAPH';
  const trailingBlocks: SupplementBlock[] = shouldAppendParagraph
    ? [{ id: createSupplementBlockId('paragraph'), type: 'PARAGRAPH', text: '' }]
    : [];
  draftBlocks.value.splice(safeIndex, 0, ...pendingBlocks, ...trailingBlocks);
  const focusIndex = safeIndex + pendingBlocks.length;
  activeBlockIndex.value = focusIndex;
  emitChange();
  void nextTick(resizeAllParagraphEditors);
  if (draftBlocks.value[focusIndex]?.type === 'PARAGRAPH') {
    void focusParagraph(focusIndex);
  }
  emit('upload-files', files, safeIndex, pendingBlocks.map((block) => block.id));
}

function handlePaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    return;
  }
  const files: File[] = [];
  Array.from(clipboard.items || []).forEach((item, index) => {
    if (!item.type.startsWith('image/')) {
      return;
    }
    const blob = item.getAsFile();
    if (blob) {
      files.push(new File([blob], pastedFileName(item.type, index), { type: item.type }));
    }
  });
  const text = clipboard.getData('text/plain');
  if (!files.length && !text.trim()) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (!files.length && text.trim() && target?.closest?.('.paragraph-editor')) {
    return;
  }

  event.preventDefault();
  let insertIndex = insertionIndexFromEvent(event);
  const textBlocks = textToParagraphBlocks(text);
  if (textBlocks.length) {
    insertBlocks(textBlocks, insertIndex);
    insertIndex += textBlocks.length;
  }
  uploadFiles(files, insertIndex, 'INLINE');
}

function textToParagraphBlocks(text: string): SupplementBlock[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ id: createSupplementBlockId('paragraph'), type: 'PARAGRAPH' as const, text: part }));
}

function imageExtension(type: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  };
  return map[type] || 'png';
}

function pastedFileName(type: string, index: number): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `pasted-${stamp}-${index + 1}.${imageExtension(type)}`;
}

function retryUpload(index: number) {
  const block = draftBlocks.value[index];
  if (!block || block.type === 'PARAGRAPH') {
    return;
  }
  const file = pendingFiles.get(block.id);
  if (!file) {
    draftBlocks.value[index] = { ...block, error: '缺少原始图片，请删除后重新粘贴。' };
    emitChange();
    return;
  }
  draftBlocks.value[index] = { ...block, status: 'UPLOADING', error: undefined };
  emitChange();
  emit('upload-files', [file], index, [block.id]);
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  uploadFiles(Array.from(input.files || []), insertionIndexFromEvent(event), 'ATTACHMENT');
  input.value = '';
}

function handleDrop(event: DragEvent) {
  dragging.value = false;
  uploadFiles(Array.from(event.dataTransfer?.files || []), insertionIndexFromEvent(event), 'ATTACHMENT');
}

function filePreviewUrl(file: SupplementFileBlock): string {
  return file.path ? artifactViewUrl(file.path, props.projectId) : pendingPreviewUrls.get(file.id) || '';
}

function imagePreviewSrc(file: SupplementFileBlock): string {
  return filePreviewUrl(file);
}

function fileExtension(file: SupplementFileBlock): string {
  const match = file.name.match(/\.([^.]+)$/);
  return match ? match[1].slice(0, 4).toUpperCase() : 'FILE';
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function createObjectUrl(file: File): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return '';
  }
  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

function revokeObjectUrl(url: string) {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }
  URL.revokeObjectURL(url);
}

function revokePendingPreview(blockId: string) {
  const url = pendingPreviewUrls.get(blockId);
  if (!url) {
    return;
  }
  revokeObjectUrl(url);
  pendingPreviewUrls.delete(blockId);
}

function syncPendingPreviewUrls(blocks: SupplementBlock[]) {
  const activeIds = new Set(blocks.map((block) => block.id));
  Array.from(pendingPreviewUrls.keys()).forEach((blockId) => {
    if (!activeIds.has(blockId)) {
      revokePendingPreview(blockId);
    }
  });
}

function resizeParagraphEditor(editor: HTMLTextAreaElement) {
  editor.style.height = 'auto';
  editor.style.height = `${Math.max(28, editor.scrollHeight)}px`;
}

function resizeAllParagraphEditors() {
  composerRoot.value?.querySelectorAll<HTMLTextAreaElement>('.paragraph-editor').forEach(resizeParagraphEditor);
}
</script>

<style scoped>
.supplement-composer {
  min-width: 0;
}

.supplement-composer.dragging {
  color: #2563eb;
}

.supplement-composer.dragging .comment-editor-surface {
  border-color: #2563eb;
  background: #f8fbff;
}

.comment-editor-shell {
  overflow: hidden;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #fff;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 44px;
  padding: 8px 12px;
  border-bottom: 1px solid #eef2f7;
  color: #172033;
  font-weight: 600;
}

.hidden-file-input {
  display: none;
}

.comment-editor-surface {
  position: relative;
  min-height: 360px;
  max-height: min(58vh, 620px);
  overflow-y: auto;
  padding: 18px 20px 22px;
  border: 1px solid transparent;
  background: #fff;
  cursor: text;
}

.comment-flow {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.composer-placeholder {
  margin: 0;
  padding: 10px 2px;
  color: #64748b;
}

.comment-node {
  position: relative;
  min-width: 0;
}

.comment-node.is-paragraph {
  display: block;
}

.paragraph-editor {
  display: block;
  width: 100%;
  min-height: 28px;
  padding: 0;
  resize: none;
  overflow: hidden;
  border: 0;
  background: transparent;
  outline: 0;
  color: #172033;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.paragraph-editor::placeholder {
  color: #94a3b8;
}

.comment-embed {
  position: relative;
  display: grid;
  grid-template-columns: minmax(180px, 360px) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  width: min(100%, 760px);
  margin: 2px 0;
  padding: 10px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #f9fbfe;
}

.asset-preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 180px;
  overflow: hidden;
  border-radius: 6px;
  background: #f1f5f9;
  color: #64748b;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.status-pill {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-size: 12px;
}

.status-pill.error {
  background: rgba(220, 38, 38, 0.86);
}

.asset-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.embed-meta {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.asset-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.asset-title-row strong {
  overflow: hidden;
  color: #172033;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-title-row span,
.status-text {
  color: #64748b;
  font-size: 12px;
}

.caption-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 0;
  border: 1px solid #dbe5f2;
  border-color: transparent transparent #dbe5f2;
  border-radius: 0;
  background: transparent;
  color: #172033;
  font: inherit;
}

.caption-input:focus {
  border-color: #2563eb;
  outline: 0;
}

.status-text {
  margin: 0;
}

.status-text.error {
  color: #dc2626;
}

.asset-main a {
  color: #2563eb;
  font-size: 13px;
  text-decoration: none;
}

.asset-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.comment-file-chip {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: min(100%, 680px);
  padding: 10px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #f9fbfe;
}

.file-badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 6px;
  background: #eaf2ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.icon-action {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  text-decoration: none;
}

.icon-action:hover {
  background: #f1f5f9;
}

.icon-action.danger {
  color: #dc2626;
}

.status-failed {
  border-color: #fecaca;
  background: #fffafa;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 8px 12px;
  border-top: 1px solid #eef2f7;
  color: #64748b;
  font-size: 13px;
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.footer-hint span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear-all-action {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
  font: inherit;
}

.clear-all-action:hover {
  color: #b91c1c;
}

@media (max-width: 760px) {
  .composer-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .comment-editor-surface {
    min-height: 320px;
    padding: 14px;
  }

  .comment-embed,
  .comment-file-chip {
    grid-template-columns: 1fr;
  }

  .asset-actions {
    justify-content: flex-end;
  }

  .composer-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .footer-hint {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .footer-hint span {
    white-space: normal;
  }
}
</style>
