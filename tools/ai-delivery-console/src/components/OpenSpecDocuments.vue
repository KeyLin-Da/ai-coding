<template>
  <div class="openspec-preview-tabs">
    <div class="section-title">
      <strong>OpenSpec 工作</strong>
      <span class="muted">{{ modelValue || rootPath || '未关联' }}</span>
    </div>
    <el-tabs :model-value="modelValue" class="openspec-doc-tabs" @update:model-value="update">
      <el-tab-pane v-for="doc in documents" :key="doc.id" :label="doc.label" :name="doc.path" :disabled="!doc.exists" />
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import type { OpenSpecArtifactRef } from '@shared/workflow';

defineProps<{
  modelValue: string;
  documents: OpenSpecArtifactRef[];
  rootPath?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

function update(value: string | number) {
  emit('update:modelValue', String(value));
}
</script>

<style scoped>
.openspec-preview-tabs {
  display: grid;
  gap: 8px;
  padding: 12px 12px 0;
  border: 1px solid #e3e8f2;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: #ffffff;
}

.openspec-doc-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.openspec-doc-tabs :deep(.el-tabs__item) {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.section-title .muted {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
