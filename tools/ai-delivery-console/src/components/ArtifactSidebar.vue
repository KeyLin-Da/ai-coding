<template>
  <aside class="workspace-band artifact-sidebar">
    <div class="toolbar">
      <strong>产物</strong>
      <el-button :icon="Refresh" size="small" @click="$emit('refresh')">刷新</el-button>
    </div>
    <div class="sidebar-section">
      <el-empty v-if="!artifactGroups.length" description="暂无文件产物" />
      <el-scrollbar v-else height="320px">
        <section v-for="group in artifactGroups" :key="group.stage" class="artifact-group">
          <strong class="artifact-group-title">{{ stageLabels[group.stage] }}</strong>
          <button v-for="artifact in group.items" :key="artifact.id" class="artifact-row" type="button" @click="$emit('select', artifact)">
            <span class="artifact-icon">
              <Document />
            </span>
            <span class="artifact-main">
              <span>{{ artifact.label }}</span>
              <small>{{ artifact.exists ? artifact.path : '未生成' }}</small>
            </span>
            <el-tag size="small" :type="artifact.exists ? 'success' : 'info'" effect="light">
              {{ artifact.exists ? '已生成' : '未生成' }}
            </el-tag>
          </button>
        </section>
      </el-scrollbar>
    </div>
    <div class="sidebar-section">
      <strong>评审问题</strong>
      <el-empty v-if="!issues.length" description="暂无问题" />
      <el-scrollbar v-else height="260px">
        <div v-for="issue in issues" :key="issue.id" class="issue-row">
          <el-tag :type="issue.severity === 'BLOCKER' ? 'danger' : 'warning'" size="small">
            {{ issue.severity === 'BLOCKER' ? '阻断' : '建议' }}
          </el-tag>
          <p>{{ issue.title }}</p>
          <small>{{ issue.status }}</small>
        </div>
      </el-scrollbar>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Document, Refresh } from '@element-plus/icons-vue';
import type { ArtifactRef, ReviewIssue } from '@shared/workflow';
import { stageLabels, workflowStages, type WorkflowStage } from '@shared/workflow';

const props = defineProps<{
  artifacts: ArtifactRef[];
  issues: ReviewIssue[];
}>();

defineEmits<{
  (event: 'refresh'): void;
  (event: 'select', artifact: ArtifactRef): void;
}>();

const artifactGroups = computed(() =>
  workflowStages
    .map((stage) => ({
      stage,
      items: props.artifacts.filter((artifact) => artifact.stage === stage && artifact.kind !== 'directory')
    }))
    .filter((group): group is { stage: WorkflowStage; items: ArtifactRef[] } => group.items.length > 0)
);
</script>

<style scoped>
.artifact-sidebar {
  overflow: hidden;
}

.sidebar-section {
  padding: 12px;
  border-bottom: 1px solid #e3e8f2;
}

.artifact-group {
  display: grid;
  gap: 6px;
  padding: 4px 0 10px;
}

.artifact-group + .artifact-group {
  border-top: 1px solid #eef2f7;
  padding-top: 10px;
}

.artifact-group-title {
  color: #334155;
  font-size: 13px;
  line-height: 1.5;
}

.artifact-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  gap: 10px;
  padding: 10px 8px;
  border: 0;
  border-bottom: 1px solid #eef2f7;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
}

.artifact-row:hover {
  background: #f8fbff;
}

.artifact-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
}

.artifact-icon svg {
  width: 15px;
  height: 15px;
}

.artifact-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.artifact-main span,
.artifact-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-main small,
.issue-row small {
  color: #697891;
}

.issue-row {
  display: grid;
  gap: 6px;
  padding: 10px 0;
  border-bottom: 1px solid #eef2f7;
}

.issue-row p {
  margin: 0;
  line-height: 1.5;
}
</style>
