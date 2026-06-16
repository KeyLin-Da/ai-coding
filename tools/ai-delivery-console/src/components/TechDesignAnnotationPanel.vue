<template>
  <aside class="tech-design-annotation-panel">
    <div class="annotation-panel-header">
      <strong>批注</strong>
      <span class="annotation-panel-header-actions">
        <small>{{ annotations.length }} 条</small>
        <el-button :icon="Fold" size="small" circle title="收起批注" @click="$emit('collapse')" />
      </span>
    </div>
    <div class="annotation-list">
      <el-empty v-if="!annotations.length" description="当前版本暂无批注" />
      <article v-for="annotation in annotations" :key="annotation.id" class="annotation-item">
        <div class="annotation-item-header">
          <el-tag size="small" :type="tagType(annotation.status)" effect="light">{{ statusText(annotation.status) }}</el-tag>
          <small>{{ versionText(annotation) }}</small>
        </div>
        <blockquote>{{ annotation.selectedText }}</blockquote>
        <p>{{ annotation.comment }}</p>
        <div class="annotation-actions">
          <el-checkbox
            :model-value="annotation.includeInNextGeneration"
            :disabled="annotation.status === 'RESOLVED'"
            @change="(value) => $emit('toggle-include', annotation, value === true)"
          >
            纳入生成
          </el-checkbox>
          <span class="annotation-action-buttons">
            <el-button :icon="Aim" size="small" circle title="定位批注" @click="$emit('locate', annotation)" />
            <el-button
              v-if="annotation.status !== 'RESOLVED'"
              :icon="Check"
              size="small"
              circle
              title="标记已解决"
              @click="$emit('resolve', annotation)"
            />
            <el-button :icon="Delete" size="small" circle title="删除批注" @click="$emit('delete', annotation)" />
          </span>
        </div>
      </article>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Aim, Check, Delete, Fold } from '@element-plus/icons-vue';
import type { TechDesignAnnotation, TechDesignAnnotationStatus } from '@shared/workflow';

defineProps<{
  annotations: TechDesignAnnotation[];
}>();

defineEmits<{
  (event: 'locate', annotation: TechDesignAnnotation): void;
  (event: 'resolve', annotation: TechDesignAnnotation): void;
  (event: 'toggle-include', annotation: TechDesignAnnotation, include: boolean): void;
  (event: 'delete', annotation: TechDesignAnnotation): void;
  (event: 'collapse'): void;
}>();

function statusText(status: TechDesignAnnotationStatus): string {
  const labels: Record<TechDesignAnnotationStatus, string> = {
    OPEN: '未解决',
    RESOLVED: '已解决',
    CARRIED_FORWARD: '已带入',
    STALE: '已失效'
  };
  return labels[status];
}

function tagType(status: TechDesignAnnotationStatus): 'primary' | 'success' | 'warning' | 'info' {
  if (status === 'RESOLVED') return 'success';
  if (status === 'STALE') return 'warning';
  if (status === 'CARRIED_FORWARD') return 'primary';
  return 'info';
}

function versionText(annotation: TechDesignAnnotation): string {
  return annotation.versionNo ? `v${annotation.versionNo}` : annotation.versionId;
}
</script>

<style scoped>
.tech-design-annotation-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  border-left: 1px solid #e5e7eb;
  background: #ffffff;
}

.annotation-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 4px;
}

.annotation-panel-header small {
  color: #6b7280;
}

.annotation-panel-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.annotation-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 12px 16px;
}

.annotation-item {
  padding: 12px 0;
  border-bottom: 1px solid #edf0f5;
}

.annotation-item-header,
.annotation-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.annotation-item-header small {
  color: #6b7280;
}

.annotation-item blockquote {
  margin: 10px 0 8px;
  padding-left: 10px;
  border-left: 3px solid #f59e0b;
  color: #374151;
}

.annotation-item p {
  margin: 0 0 10px;
  color: #111827;
  line-height: 1.5;
}

.annotation-action-buttons {
  display: inline-flex;
  gap: 6px;
}
</style>
