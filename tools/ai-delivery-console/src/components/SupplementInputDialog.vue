<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(1280px, 94vw)"
    top="3vh"
    destroy-on-close
    class="supplement-input-dialog"
    @update:model-value="emit('update:modelValue', $event)"
    @open="syncDraft"
  >
    <section class="supplement-dialog-body">
      <div class="supplement-current-panel">
        <div v-if="documentPath" class="supplement-document">
          <strong>{{ documentLabel }}</strong>
          <span>{{ documentPath }}</span>
        </div>
        <div v-if="notice" class="supplement-notice">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ notice }}</span>
        </div>
        <SupplementComposer
          v-model="draftBlocks"
          :project-id="projectId"
          :placeholder="placeholder"
          :accept="accept"
          :uploading="uploading"
          @upload-files="handleComposerUpload"
        />
      </div>
      <aside class="supplement-history-panel">
        <header class="history-header">
          <strong>历史输入</strong>
          <span>{{ history.length }} 条</span>
        </header>
        <div v-if="history.length" class="history-list">
          <article v-for="item in history" :key="item.id || item.path" class="history-item">
            <div class="history-main">
              <strong>{{ item.title || actionText(item.actionType) }}</strong>
              <span>{{ formatHistoryTime(item.createdAt) }}</span>
            </div>
            <p>{{ item.path }}</p>
            <a class="history-link" :href="artifactViewUrl(item.path, projectId)" target="_blank" rel="noreferrer">查看</a>
          </article>
        </div>
        <p v-else class="history-empty">暂无历史输入</p>
      </aside>
    </section>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="uploading" @click="save">保存补充输入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';
import type { ActionType, SupplementBlock } from '@shared/workflow';
import SupplementComposer from '@/components/SupplementComposer.vue';
import { artifactViewUrl } from '@/utils/markdown-assets';
import {
  buildSupplementBlocks,
  buildSupplementComposerValue,
  fileToSupplementBlock,
  type SupplementFileLike
} from '@/utils/supplement-composer';

export type SupplementInputFile = SupplementFileLike;
export interface SupplementInputHistoryItem {
  id?: string;
  actionType: ActionType;
  status?: string;
  path: string;
  createdAt?: string;
  title?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    text?: string;
    blocks?: SupplementBlock[];
    files?: SupplementInputFile[];
    projectId?: string | number;
    documentLabel?: string;
    documentPath?: string;
    notice?: string;
    placeholder?: string;
    accept?: string;
    maxLength?: number;
    uploading?: boolean;
    closeOnSave?: boolean;
    inputClass?: string;
    history?: SupplementInputHistoryItem[];
  }>(),
  {
    title: '补充输入',
    text: '',
    blocks: undefined,
    files: () => [],
    projectId: undefined,
    documentLabel: '当前文档',
    documentPath: '',
    notice: '',
    placeholder: '像评论一样输入补充说明，可直接粘贴截图或拖入文件。',
    accept: '.pdf,.md,.markdown,image/*',
    maxLength: 5000,
    uploading: false,
    closeOnSave: true,
    inputClass: '',
    history: () => []
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'update:text', value: string): void;
  (event: 'update:blocks', value: SupplementBlock[]): void;
  (event: 'upload-files', files: File[]): void;
  (event: 'save', value: string): void;
}>();

const draftBlocks = ref<SupplementBlock[]>([]);

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      syncDraft();
    }
  }
);

watch(
  () => props.files,
  (files) => {
    if (!props.modelValue) {
      return;
    }
    mergeUploadedFiles(files || []);
  },
  { deep: true }
);

function syncDraft() {
  draftBlocks.value = buildSupplementBlocks({
    blocks: props.blocks,
    text: props.text,
    files: props.files
  });
}

function save() {
  const value = buildSupplementComposerValue(draftBlocks.value);
  emit('update:blocks', value.blocks);
  emit('update:text', value.markdown);
  emit('save', value.markdown);
  if (props.closeOnSave) {
    emit('update:modelValue', false);
  }
}

function handleComposerUpload(files: File[]) {
  emit('upload-files', files);
}

function actionText(actionType: ActionType): string {
  const text: Partial<Record<ActionType, string>> = {
    PRD_ANALYZE: 'PRD 初始生成',
    PRD_CLARIFY: 'PRD 澄清',
    DESIGN_GENERATE: '技术方案生成',
    OPENSPEC_FF: 'OpenSpec 工件生成'
  };
  return text[actionType] || actionType;
}

function formatHistoryTime(value?: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (item: number) => String(item).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function mergeUploadedFiles(files: SupplementInputFile[]) {
  const existingKeys = new Set(
    draftBlocks.value
      .filter((block) => block.type === 'IMAGE' || block.type === 'FILE')
      .flatMap((block) => [block.fileId, block.path])
      .filter(Boolean)
  );
  const incomingBlocks = files.filter((file) => !existingKeys.has(file.id) && !existingKeys.has(file.path)).map(fileToSupplementBlock);
  if (!incomingBlocks.length) {
    return;
  }

  const nextBlocks = [...draftBlocks.value];
  for (const incomingBlock of incomingBlocks) {
    const pendingIndex = nextBlocks.findIndex((block) => (block.type === 'IMAGE' || block.type === 'FILE') && block.status === 'UPLOADING' && !block.path);
    if (pendingIndex >= 0) {
      const pendingBlock = nextBlocks[pendingIndex];
      nextBlocks.splice(pendingIndex, 1, {
        ...incomingBlock,
        contextRole: pendingBlock.type === 'IMAGE' || pendingBlock.type === 'FILE' ? pendingBlock.contextRole : incomingBlock.contextRole
      });
    } else {
      nextBlocks.push(incomingBlock);
    }
  }
  draftBlocks.value = nextBlocks;
  emit('update:blocks', buildSupplementComposerValue(nextBlocks).blocks);
}
</script>

<style scoped>
.supplement-dialog-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  align-items: start;
  gap: 14px;
}

.supplement-current-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.supplement-document {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #f8fbff;
}

.supplement-document span {
  color: #64748b;
  overflow-wrap: anywhere;
}

.supplement-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  box-sizing: border-box;
  padding: 7px 10px;
  border-radius: 6px;
  background: #f4f6f9;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.4;
}

.supplement-notice span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.supplement-notice :deep(.el-icon) {
  flex: 0 0 auto;
}

:deep(.el-dialog__body) {
  padding-top: 8px;
  max-height: calc(92vh - 124px);
  overflow: hidden;
}

.supplement-history-panel {
  min-width: 0;
  max-height: calc(92vh - 168px);
  overflow-y: auto;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fbfdff;
}

.history-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 12px;
  border-bottom: 1px solid #edf2f7;
  background: #fbfdff;
}

.history-header strong {
  color: #172033;
}

.history-header span {
  color: #64748b;
  font-size: 12px;
}

.history-list {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.history-item {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid #e8eef6;
  border-radius: 8px;
  background: #fff;
}

.history-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.history-main strong {
  min-width: 0;
  overflow: hidden;
  color: #172033;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-main span,
.history-item p {
  color: #64748b;
  font-size: 12px;
}

.history-item p {
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.history-link {
  width: fit-content;
  color: #2563eb;
  font-size: 13px;
  text-decoration: none;
}

.history-link:hover {
  text-decoration: underline;
}

.history-empty {
  margin: 0;
  padding: 24px 12px;
  color: #94a3b8;
  text-align: center;
}

@media (max-width: 960px) {
  .supplement-dialog-body {
    grid-template-columns: 1fr;
  }

  :deep(.el-dialog__body) {
    overflow-y: auto;
  }

  .supplement-history-panel {
    max-height: 240px;
  }
}
</style>
