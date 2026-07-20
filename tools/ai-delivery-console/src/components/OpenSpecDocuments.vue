<template>
  <section class="openspec-documents-panel">
    <div class="section-title">
      <div>
        <strong>OpenSpec 工作</strong>
        <p class="muted">{{ modelValue || rootPath || '未关联' }}</p>
      </div>
      <span class="muted">{{ documentCountText }}</span>
    </div>

    <div class="openspec-document-groups">
      <section v-for="group in documentGroups" :key="group.key" class="openspec-document-group">
        <div class="openspec-document-group-heading">
          <strong>{{ group.label }}</strong>
          <span class="muted">{{ group.items.length }} 个</span>
        </div>
        <div class="openspec-document-list">
          <div
            v-for="doc in group.items"
            :key="doc.id"
            class="openspec-document-row"
            :class="{ active: doc.path === modelValue, missing: !doc.exists }"
            @click="doc.exists && update(doc.path)"
          >
            <span class="openspec-document-type">{{ typeText(doc.type) }}</span>
            <span class="openspec-document-main">
              <strong>{{ doc.label }}</strong>
              <small>{{ doc.path }}</small>
            </span>
            <el-tag size="small" :type="doc.exists ? 'success' : 'info'" effect="light">
              {{ doc.exists ? '已生成' : '未生成' }}
            </el-tag>
            <span class="openspec-document-actions">
              <el-button size="small" :icon="View" :disabled="!doc.exists" @click.stop="emit('preview', doc)">预览</el-button>
              <el-button size="small" type="primary" plain :icon="EditPen" :disabled="!doc.exists" @click.stop="emit('edit', doc)">编辑</el-button>
            </span>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { EditPen, View } from '@element-plus/icons-vue';
import type { OpenSpecArtifactRef, OpenSpecArtifactType } from '@shared/workflow';

const props = defineProps<{
  modelValue: string;
  documents: OpenSpecArtifactRef[];
  rootPath?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'preview', value: OpenSpecArtifactRef): void;
  (event: 'edit', value: OpenSpecArtifactRef): void;
}>();

const documentGroups = computed(() => [
  {
    key: 'artifacts',
    label: '基础工件',
    items: props.documents.filter((doc) => doc.type !== 'spec')
  },
  {
    key: 'specs',
    label: '规格文档',
    items: props.documents.filter((doc) => doc.type === 'spec')
  }
].filter((group) => group.items.length > 0));

const documentCountText = computed(() => {
  if (!props.documents.length) {
    return '暂无文档';
  }
  const generated = props.documents.filter((doc) => doc.exists).length;
  return generated === props.documents.length ? `${props.documents.length} 个文档` : `${generated}/${props.documents.length} 已生成`;
});

function typeText(type: OpenSpecArtifactType) {
  const labels: Record<OpenSpecArtifactType, string> = {
    proposal: 'Proposal',
    design: 'Design',
    tasks: 'Tasks',
    spec: 'Spec'
  };
  return labels[type] || type;
}

function update(value: string) {
  emit('update:modelValue', value);
}
</script>

<style scoped>
.openspec-documents-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fbfdff;
}

.section-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.section-title > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.section-title p {
  margin: 0;
  overflow-wrap: anywhere;
}

.section-title .muted {
  overflow-wrap: anywhere;
}

.openspec-document-groups {
  display: grid;
  gap: 12px;
}

.openspec-document-group {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.openspec-document-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.openspec-document-group-heading strong {
  color: #172033;
  font-size: 14px;
  font-weight: 600;
}

.openspec-document-list {
  display: grid;
  gap: 8px;
}

.openspec-document-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
  color: #1f2a3d;
  text-align: left;
  cursor: pointer;
}

.openspec-document-row:hover,
.openspec-document-row.active {
  border-color: #2563eb;
  background: #f8fbff;
}

.openspec-document-row.active {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.openspec-document-row.missing {
  cursor: not-allowed;
  opacity: 0.72;
}

.openspec-document-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
}

.openspec-document-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.openspec-document-main strong,
.openspec-document-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.openspec-document-main strong {
  color: #172033;
  font-size: 14px;
  font-weight: 600;
}

.openspec-document-main small {
  color: #697891;
}

.openspec-document-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 760px) {
  .section-title,
  .openspec-document-group-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .openspec-document-row {
    grid-template-columns: 1fr;
  }

  .openspec-document-type {
    justify-content: flex-start;
    width: fit-content;
  }

  .openspec-document-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
