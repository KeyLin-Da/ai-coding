<template>
  <section class="git-inspector">
    <template v-if="summary">
      <div class="git-overview">
        <div>
          <strong>工程变更概览</strong>
          <p class="muted">{{ summary.projects.length }} 个工程 · {{ summary.files.length }} 个文件 · {{ summary.updatedAt }}</p>
        </div>
        <div class="git-metrics">
          <span>{{ summary.files.length }} 文件</span>
          <span class="additions">+{{ summary.additions }}</span>
          <span class="deletions">-{{ summary.deletions }}</span>
        </div>
      </div>

      <el-tabs v-model="activeProjectPath" class="git-project-tabs">
        <el-tab-pane v-for="project in summary.projects" :key="project.project.path" :name="project.project.path">
          <template #label>
            <span class="project-tab-label">
              {{ project.project.name }}
              <el-tag size="small" effect="plain">{{ project.files.length }}</el-tag>
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <el-alert
        v-if="activeProject?.error"
        type="error"
        show-icon
        :title="activeProject.error"
        class="git-project-alert"
      />
      <el-alert
        v-else-if="activeProject && !activeProject.branchMatches"
        type="warning"
        show-icon
        :title="`当前分支 ${activeProject.currentBranch || '-'} 与期望分支 ${activeProject.expectedBranch || '-'} 不一致`"
        class="git-project-alert"
      />

      <div v-if="activeProject" class="git-project-summary">
        <span>{{ activeProject.project.path }}</span>
        <span>当前分支：{{ activeProject.currentBranch || '-' }}</span>
        <span>期望分支：{{ activeProject.expectedBranch || '-' }}</span>
        <span class="additions">+{{ activeProject.additions }}</span>
        <span class="deletions">-{{ activeProject.deletions }}</span>
      </div>

      <div v-if="activeProject?.files.length" class="git-review-layout">
        <aside class="git-file-pane">
          <button class="git-file-row" :class="{ active: selectedFilePath === '' }" type="button" @click="selectedFilePath = ''">
            <span class="git-file-status all">ALL</span>
            <span class="git-file-path">全部变更</span>
            <span class="git-file-stat">+{{ activeProject.additions }} -{{ activeProject.deletions }}</span>
          </button>
          <button
            v-for="file in activeProject.files"
            :key="`${file.status}-${file.path}`"
            class="git-file-row"
            :class="{ active: selectedFilePath === file.path }"
            type="button"
            @click="selectedFilePath = file.path"
          >
            <span class="git-file-status">{{ file.status }}</span>
            <span class="git-file-path">{{ file.path }}</span>
            <span class="git-file-flags">
              <el-tag v-if="file.staged" size="small" effect="plain">staged</el-tag>
              <el-tag v-if="file.unstaged" size="small" effect="plain">unstaged</el-tag>
            </span>
            <span class="git-file-stat">+{{ file.additions || 0 }} -{{ file.deletions || 0 }}</span>
          </button>
        </aside>

        <section class="git-diff-pane">
          <div class="git-diff-toolbar">
            <div>
              <strong>{{ selectedFilePath || '全部变更' }}</strong>
              <p class="muted">{{ activeProject.project.name }} · diff2html</p>
            </div>
            <el-radio-group v-model="diffViewMode" size="small">
              <el-radio-button value="line-by-line">统一视图</el-radio-button>
              <el-radio-button value="side-by-side">左右对比</el-radio-button>
            </el-radio-group>
          </div>
          <div v-if="currentDiffHtml" class="git-diff-html" v-html="currentDiffHtml"></div>
          <el-empty v-else description="当前选择暂无可视化 diff" />
        </section>
      </div>

      <el-empty v-else description="暂无 Git 变更" />
    </template>
    <el-empty v-else description="尚未读取 Git 变更" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { html as diffToHtml } from 'diff2html/bundles/js/diff2html.min.js';
import 'diff2html/bundles/css/diff2html.min.css';
import type { GitChangeSummary, GitProjectChangeSummary } from '@shared/workflow';

const props = defineProps<{
  summary?: GitChangeSummary;
}>();

const activeProjectPath = ref('');
const selectedFilePath = ref('');
const diffViewMode = ref<'line-by-line' | 'side-by-side'>('side-by-side');

const activeProject = computed<GitProjectChangeSummary | undefined>(() =>
  props.summary?.projects.find((project) => project.project.path === activeProjectPath.value)
);

const currentDiff = computed(() => {
  if (!activeProject.value) {
    return '';
  }
  if (!selectedFilePath.value) {
    return activeProject.value.diff;
  }
  return extractFileDiff(activeProject.value.diff, selectedFilePath.value);
});

const currentDiffHtml = computed(() => {
  if (!currentDiff.value.trim()) {
    return '';
  }
  return diffToHtml(currentDiff.value, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: diffViewMode.value
  });
});

function extractFileDiff(diff: string, filePath: string): string {
  const sections = diff
    .split(/^diff --git /gm)
    .filter(Boolean)
    .map((section) => `diff --git ${section}`);
  return sections.find((section) => section.includes(` b/${filePath}`) || section.includes(` a/${filePath}`) || section.includes(filePath)) || '';
}

watch(
  () => props.summary,
  (summary) => {
    activeProjectPath.value = summary?.projects[0]?.project.path || '';
    selectedFilePath.value = '';
  },
  { immediate: true }
);

watch(activeProjectPath, () => {
  selectedFilePath.value = '';
});
</script>

<style scoped>
.git-inspector {
  display: grid;
  gap: 12px;
}

.git-overview,
.git-project-summary,
.git-diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.git-overview {
  padding: 14px 16px;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #ffffff;
}

.git-overview strong,
.git-overview p,
.git-diff-toolbar strong,
.git-diff-toolbar p {
  margin: 0;
}

.git-metrics,
.git-project-summary {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  color: #60708f;
}

.additions {
  color: #0f9f6e;
}

.deletions {
  color: #e02424;
}

.project-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.git-project-alert {
  margin: 0;
}

.git-project-summary {
  justify-content: flex-start;
  padding: 10px 12px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #f8fafc;
}

.git-review-layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  min-height: 560px;
  overflow: hidden;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #ffffff;
}

.git-file-pane {
  overflow: auto;
  border-right: 1px solid #e5eaf3;
  background: #f8fafc;
}

.git-file-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 8px;
  width: 100%;
  padding: 11px 12px;
  color: #1f2a44;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #edf1f7;
  background: transparent;
  cursor: pointer;
}

.git-file-row:hover,
.git-file-row.active {
  background: #eef5ff;
}

.git-file-status {
  min-width: 30px;
  padding: 1px 6px;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #eff6ff;
  font-size: 12px;
  text-align: center;
}

.git-file-status.all {
  color: #0f9f6e;
  border-color: #a7f3d0;
  background: #ecfdf5;
}

.git-file-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-file-flags,
.git-file-stat {
  grid-column: 2;
}

.git-file-flags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.git-file-stat {
  color: #60708f;
  font-size: 12px;
}

.git-diff-pane {
  min-width: 0;
  overflow: auto;
}

.git-diff-toolbar {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 14px;
  border-bottom: 1px solid #e5eaf3;
  background: #ffffff;
}

.git-diff-html {
  padding: 12px;
}

.git-diff-html :deep(.d2h-file-header) {
  border-radius: 8px 8px 0 0;
}

.git-diff-html :deep(.d2h-file-wrapper) {
  border-color: #e5eaf3;
  border-radius: 8px;
}

@media (max-width: 960px) {
  .git-review-layout {
    grid-template-columns: 1fr;
  }

  .git-file-pane {
    max-height: 260px;
    border-right: 0;
    border-bottom: 1px solid #e5eaf3;
  }

  .git-diff-toolbar,
  .git-overview {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
