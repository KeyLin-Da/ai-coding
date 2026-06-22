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
          <el-tag size="small" :type="tagType(annotation)" effect="light">{{ statusText(annotation) }}</el-tag>
          <small>{{ versionText(annotation) }}</small>
        </div>
        <div class="annotation-meta">{{ actorText(annotation) }} · {{ timeText(annotation.createdAt) }}</div>
        <blockquote>{{ annotation.selectedText }}</blockquote>
        <p>{{ annotation.comment }}</p>
        <section v-if="annotation.replies?.length" class="annotation-replies">
          <div v-for="reply in annotation.replies" :key="reply.id" class="annotation-reply">
            <div class="annotation-reply-meta">
              <span>{{ replyActorText(reply) }} · {{ timeText(reply.createdAt) }}</span>
              <el-button
                v-if="canDeleteReply(reply)"
                :icon="Delete"
                size="small"
                text
                title="删除回复"
                @click="$emit('delete-reply', annotation, reply)"
              />
            </div>
            <p>{{ reply.content }}</p>
          </div>
        </section>
        <div class="annotation-actions">
          <el-checkbox
            v-if="!readonly && !annotation.consumedAt"
            :model-value="annotation.includeInNextGeneration"
            :disabled="annotation.status === 'RESOLVED'"
            @change="(value) => $emit('toggle-include', annotation, value === true)"
          >
            纳入生成
          </el-checkbox>
          <span v-else-if="!readonly && annotation.consumedAt" class="consumed-hint">已纳入生成</span>
          <span v-else-if="canDelete(annotation)" class="readonly-hint">本人批注</span>
          <span v-else class="readonly-hint">只读批注</span>
          <span class="annotation-action-buttons">
            <el-button v-if="canReply(annotation)" size="small" title="回复批注" @click="$emit('reply', annotation)">回复</el-button>
            <el-button :icon="Aim" size="small" circle title="定位批注" @click="$emit('locate', annotation)" />
            <el-button
              v-if="!readonly && annotation.status !== 'RESOLVED'"
              :icon="Check"
              size="small"
              circle
              title="标记已解决"
              @click="$emit('resolve', annotation)"
            />
            <el-button v-if="canDelete(annotation)" :icon="Delete" size="small" circle title="删除批注" @click="$emit('delete', annotation)" />
          </span>
        </div>
      </article>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Aim, Check, Delete, Fold } from '@element-plus/icons-vue';
import type { TechDesignAnnotation, TechDesignAnnotationReply, TechDesignAnnotationStatus } from '@shared/workflow';

const props = withDefaults(
  defineProps<{
    annotations: TechDesignAnnotation[];
    readonly?: boolean;
    deletableAnnotationIds?: string[];
    deletableReplyIds?: string[];
    replyableAnnotationIds?: string[];
  }>(),
  {
    readonly: false,
    deletableAnnotationIds: () => [],
    deletableReplyIds: () => [],
    replyableAnnotationIds: () => []
  }
);

defineEmits<{
  (event: 'locate', annotation: TechDesignAnnotation): void;
  (event: 'resolve', annotation: TechDesignAnnotation): void;
  (event: 'toggle-include', annotation: TechDesignAnnotation, include: boolean): void;
  (event: 'delete', annotation: TechDesignAnnotation): void;
  (event: 'reply', annotation: TechDesignAnnotation): void;
  (event: 'delete-reply', annotation: TechDesignAnnotation, reply: TechDesignAnnotationReply): void;
  (event: 'collapse'): void;
}>();

function statusText(annotation: TechDesignAnnotation): string {
  if (annotation.status !== 'RESOLVED' && annotation.consumedAt) {
    return '已处理待确认';
  }
  const labels: Record<TechDesignAnnotationStatus, string> = {
    OPEN: '未解决',
    RESOLVED: '已解决',
    CARRIED_FORWARD: '已带入',
    STALE: '已失效'
  };
  return labels[annotation.status];
}

function tagType(annotation: TechDesignAnnotation): 'primary' | 'success' | 'warning' | 'info' {
  if (annotation.status === 'RESOLVED') return 'success';
  if (annotation.consumedAt) return 'primary';
  if (annotation.status === 'STALE') return 'warning';
  if (annotation.status === 'CARRIED_FORWARD') return 'primary';
  return 'info';
}

function versionText(annotation: TechDesignAnnotation): string {
  return annotation.versionNo ? `v${annotation.versionNo}` : annotation.versionId;
}

function actorText(annotation: TechDesignAnnotation): string {
  return annotation.createdByName || (annotation.createdBy == null ? '未知用户' : `用户 ${annotation.createdBy}`);
}

function replyActorText(reply: TechDesignAnnotationReply): string {
  return reply.createdByName || (reply.createdBy == null ? '未知用户' : `用户 ${reply.createdBy}`);
}

function canDelete(annotation: TechDesignAnnotation): boolean {
  return !props.readonly || props.deletableAnnotationIds.includes(annotation.id);
}

function canReply(annotation: TechDesignAnnotation): boolean {
  return annotation.status !== 'RESOLVED' && (!props.readonly || props.replyableAnnotationIds.includes(annotation.id));
}

function canDeleteReply(reply: TechDesignAnnotationReply): boolean {
  return !props.readonly || props.deletableReplyIds.includes(reply.id);
}

function timeText(value?: string): string {
  if (!value) {
    return '未知时间';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  overflow: auto;
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

.annotation-meta,
.consumed-hint,
.readonly-hint {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
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

.annotation-replies {
  display: grid;
  gap: 8px;
  margin: 10px 0;
  padding-left: 10px;
  border-left: 2px solid #e5e7eb;
}

.annotation-reply {
  padding: 8px 10px;
  border-radius: 6px;
  background: #f8fafc;
}

.annotation-reply-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  color: #64748b;
  font-size: 12px;
}

.annotation-reply p {
  margin: 0;
  color: #111827;
  line-height: 1.5;
}

.annotation-action-buttons {
  display: inline-flex;
  gap: 6px;
}
</style>
