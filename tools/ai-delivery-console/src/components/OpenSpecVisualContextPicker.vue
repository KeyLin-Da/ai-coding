<template>
  <section class="visual-context-picker" aria-label="OpenSpec 视觉上下文">
    <header class="visual-context-header">
      <div>
        <strong>视觉上下文</strong>
        <p>默认未选择图片，勾选后加入本次 OpenSpec 上下文</p>
      </div>
      <div class="visual-context-counts">
        <el-tag size="small" effect="plain">{{ candidates.length }} 张候选</el-tag>
        <el-tag size="small" :type="selectedPaths.length ? 'primary' : 'info'" effect="light">已选 {{ selectedPaths.length }}</el-tag>
        <el-button class="visual-context-open-button" size="small" type="primary" plain :disabled="loading" @click="openDialog">选择图片</el-button>
      </div>
    </header>

    <el-alert
      v-if="selectedPaths.length > softLimit"
      class="visual-context-alert"
      type="warning"
      show-icon
      title="已选择较多图片，可能稀释上下文重点。"
    />

    <el-dialog v-model="dialogVisible" class="visual-context-dialog" title="选择视觉上下文" width="760px">
      <div class="visual-context-dialog-body">
        <div class="visual-context-dialog-summary">
          <span>候选 {{ candidates.length }} 张</span>
          <span>已选 {{ draftSelectedPaths.length }} 张</span>
        </div>
        <p class="visual-context-dialog-hint">默认未选择图片。勾选图片表示加入本次 OpenSpec 工件生成上下文。</p>

        <el-alert
          v-if="draftSelectedPaths.length > softLimit"
          class="visual-context-alert"
          type="warning"
          show-icon
          title="已选择较多图片，可能稀释上下文重点。"
        />

        <div v-if="loading" class="visual-context-loading">
          <el-skeleton :rows="2" animated />
        </div>
        <el-empty v-else-if="!candidates.length" description="暂无图片候选" />
        <div v-else class="visual-context-grid">
          <article
            v-for="candidate in candidates"
            :key="candidate.path"
            class="visual-context-item"
            :class="{ selected: draftSelectedSet.has(candidate.path) }"
          >
            <label class="visual-context-select">
              <el-checkbox :model-value="draftSelectedSet.has(candidate.path)" @change="(checked) => toggleDraftPath(candidate.path, checked === true)" />
              <span>加入上下文</span>
            </label>
            <a class="visual-context-thumb" :href="previewUrl(candidate.path)" target="_blank" rel="noreferrer" :aria-label="`预览 ${candidate.name}`">
              <img :src="previewUrl(candidate.path)" :alt="candidate.name" loading="lazy" />
            </a>
            <div class="visual-context-meta">
              <strong :title="candidate.name">{{ candidate.name }}</strong>
              <span :title="candidate.path">{{ candidate.path }}</span>
            </div>
            <footer class="visual-context-footer">
              <el-tag size="small" effect="plain">{{ sourceText(candidate.source) }}</el-tag>
              <el-button link type="primary" :icon="View" @click="openPreview(candidate.path)">预览</el-button>
            </footer>
          </article>
        </div>
      </div>
      <template #footer>
        <div class="visual-context-dialog-footer">
          <el-button @click="cancelDialog">取消</el-button>
          <el-button class="visual-context-confirm-button" type="primary" @click="confirmSelection">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { View } from '@element-plus/icons-vue';
import type { OpenSpecVisualContextCandidate, OpenSpecVisualContextSource } from '@shared/workflow';
import { artifactViewUrl } from '@/utils/markdown-assets';

const props = withDefaults(
  defineProps<{
    candidates?: OpenSpecVisualContextCandidate[];
    selectedPaths?: string[];
    projectId?: string | number;
    loading?: boolean;
    softLimit?: number;
  }>(),
  {
    candidates: () => [],
    selectedPaths: () => [],
    projectId: undefined,
    loading: false,
    softLimit: 6
  }
);

const emit = defineEmits<{
  (event: 'update:selectedPaths', value: string[]): void;
}>();

const dialogVisible = ref(false);
const draftSelectedPaths = ref<string[]>([]);
const draftSelectedSet = computed(() => new Set(draftSelectedPaths.value));

watch(
  () => props.selectedPaths,
  (value) => {
    if (!dialogVisible.value) {
      draftSelectedPaths.value = uniquePaths(value || []);
    }
  },
  { immediate: true }
);

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => item.trim()).filter(Boolean))];
}

function openDialog() {
  draftSelectedPaths.value = uniquePaths(props.selectedPaths || []);
  dialogVisible.value = true;
}

function cancelDialog() {
  draftSelectedPaths.value = uniquePaths(props.selectedPaths || []);
  dialogVisible.value = false;
}

function confirmSelection() {
  emit('update:selectedPaths', uniquePaths(draftSelectedPaths.value));
  dialogVisible.value = false;
}

function toggleDraftPath(filePath: string, selected: boolean) {
  const next = new Set(draftSelectedPaths.value);
  if (selected) {
    next.add(filePath);
  } else {
    next.delete(filePath);
  }
  draftSelectedPaths.value = uniquePaths(Array.from(next));
}

function previewUrl(filePath: string): string {
  return artifactViewUrl(filePath, props.projectId);
}

function openPreview(filePath: string) {
  window.open(previewUrl(filePath), '_blank', 'noopener,noreferrer');
}

function sourceText(source: OpenSpecVisualContextSource): string {
  const labels: Record<OpenSpecVisualContextSource, string> = {
    PRD_SOURCE: 'PRD 来源',
    PRD_FILES: 'PRD 文件',
    TECH_DESIGN_SOURCE: '技术方案'
  };
  return labels[source] || source;
}
</script>

<style scoped>
.visual-context-picker {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #f8fbff;
}

.visual-context-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.visual-context-header strong {
  color: #172033;
  font-size: 14px;
  line-height: 22px;
}

.visual-context-header p {
  margin: 2px 0 0;
  color: #64748b;
  line-height: 20px;
}

.visual-context-counts {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.visual-context-open-button {
  flex-shrink: 0;
}

.visual-context-alert {
  margin: 0;
}

.visual-context-dialog-body {
  display: grid;
  gap: 12px;
}

.visual-context-dialog-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #334155;
  font-size: 13px;
}

.visual-context-dialog-hint {
  margin: 0;
  color: #64748b;
  line-height: 20px;
}

.visual-context-loading {
  padding: 4px 0;
}

.visual-context-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.visual-context-item {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #fff;
}

.visual-context-item.selected {
  border-color: #409eff;
  background: #eef6ff;
}

.visual-context-select {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  font-size: 13px;
}

.visual-context-thumb {
  display: block;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
}

.visual-context-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.visual-context-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.visual-context-meta strong,
.visual-context-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-context-meta strong {
  color: #172033;
  font-size: 13px;
  line-height: 20px;
}

.visual-context-meta span {
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
}

.visual-context-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.visual-context-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 760px) {
  .visual-context-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .visual-context-grid {
    grid-template-columns: 1fr;
  }
}
</style>
