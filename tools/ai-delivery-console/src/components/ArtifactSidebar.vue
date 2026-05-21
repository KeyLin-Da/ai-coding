<template>
  <aside class="workspace-band artifact-sidebar">
    <div class="toolbar">
      <strong>产物与问题</strong>
      <el-button :icon="Refresh" size="small" @click="$emit('refresh')">刷新</el-button>
    </div>
    <div class="sidebar-section">
      <el-empty v-if="!artifacts.length" description="暂无产物" />
      <el-scrollbar v-else height="260px">
        <button v-for="artifact in artifacts" :key="artifact.id" class="artifact-row" type="button" @click="$emit('select', artifact.path)">
          <span>{{ artifact.label }}</span>
          <small>{{ artifact.exists ? artifact.path : '未生成' }}</small>
        </button>
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
import { Refresh } from '@element-plus/icons-vue';
import type { ArtifactRef, ReviewIssue } from '@shared/workflow';

defineProps<{
  artifacts: ArtifactRef[];
  issues: ReviewIssue[];
}>();

defineEmits<{
  (event: 'refresh'): void;
  (event: 'select', path: string): void;
}>();
</script>

<style scoped>
.artifact-sidebar {
  overflow: hidden;
}

.sidebar-section {
  padding: 12px;
  border-bottom: 1px solid #e3e8f2;
}

.artifact-row {
  display: grid;
  width: 100%;
  gap: 4px;
  padding: 10px;
  border: 0;
  border-bottom: 1px solid #eef2f7;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.artifact-row span,
.artifact-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-row small,
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
