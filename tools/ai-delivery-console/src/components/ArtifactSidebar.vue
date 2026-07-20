<template>
  <aside class="workspace-band artifact-sidebar">
    <div class="toolbar sidebar-toolbar">
      <div class="sidebar-tabs" role="tablist" aria-label="右侧内容">
        <button
          class="sidebar-tab"
          :class="{ active: activeTab === 'artifacts' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'artifacts'"
          @click="activeTab = 'artifacts'"
        >
          <span>产物</span>
          <small>{{ artifactCount }}</small>
        </button>
        <button
          class="sidebar-tab"
          :class="{ active: activeTab === 'issues' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'issues'"
          @click="activeTab = 'issues'"
        >
          <span>评审问题</span>
          <small :class="{ warning: issueCount > 0 }">{{ issueCount }}</small>
        </button>
      </div>
      <div v-if="activeTab === 'artifacts'" class="sidebar-actions">
        <el-button :icon="Upload" size="small" @click="$emit('public-sync')">公开同步</el-button>
        <el-button :icon="Refresh" size="small" @click="$emit('refresh')">刷新</el-button>
      </div>
    </div>
    <div class="sidebar-content">
      <section v-if="activeTab === 'artifacts'" class="sidebar-panel">
        <el-empty v-if="!artifactGroups.length" description="暂无文件产物" />
        <el-scrollbar v-else class="sidebar-scroll" height="100%">
          <section v-for="group in artifactGroups" :key="group.stage" class="artifact-group">
            <strong class="artifact-group-title">{{ stageLabels[group.stage] }}</strong>
            <button v-for="artifact in group.items" :key="artifact.id" class="artifact-row" type="button" @click="$emit('select', artifact)">
              <span class="artifact-icon">
                <Document />
              </span>
              <span class="artifact-main">
                <span>{{ artifact.label }}</span>
                <small>{{ artifact.exists ? artifact.path : '未生成' }}</small>
                <small v-if="versionText(artifact)" class="version-line">{{ versionText(artifact) }}</small>
              </span>
              <el-tag size="small" :type="artifact.exists ? 'success' : 'info'" effect="light">
                {{ artifact.exists ? '已生成' : '未生成' }}
              </el-tag>
            </button>
          </section>
        </el-scrollbar>
      </section>
      <section v-else class="sidebar-panel">
        <el-empty v-if="!issues.length" description="暂无问题" />
        <el-scrollbar v-else class="sidebar-scroll" height="100%">
          <div v-for="issue in issues" :key="issue.id" class="issue-row">
            <el-tag :type="issue.severity === 'BLOCKER' ? 'danger' : 'warning'" size="small">
              {{ issue.severity === 'BLOCKER' ? '阻断' : '建议' }}
            </el-tag>
            <p>{{ issue.title }}</p>
            <small>{{ issue.status }}</small>
          </div>
        </el-scrollbar>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Document, Refresh, Upload } from '@element-plus/icons-vue';
import type { ArtifactRef, RequirementWorkflow, ReviewIssue } from '@shared/workflow';
import { stageLabels, workflowStagesForWorkflow, type WorkflowStage } from '@shared/workflow';

type SidebarTab = 'artifacts' | 'issues';

const props = defineProps<{
  workflow?: Pick<RequirementWorkflow, 'requirementType'>;
  artifacts: ArtifactRef[];
  issues: ReviewIssue[];
}>();

defineEmits<{
  (event: 'refresh'): void;
  (event: 'select', artifact: ArtifactRef): void;
  (event: 'public-sync'): void;
}>();

const activeTab = ref<SidebarTab>('artifacts');

const artifactGroups = computed(() =>
  workflowStagesForWorkflow(props.workflow)
    .map((stage) => ({
      stage,
      items: props.artifacts.filter((artifact) => artifact.stage === stage && artifact.kind !== 'directory')
    }))
    .filter((group): group is { stage: WorkflowStage; items: ArtifactRef[] } => group.items.length > 0)
);
const artifactCount = computed(() => artifactGroups.value.reduce((total, group) => total + group.items.length, 0));
const issueCount = computed(() => props.issues.length);

function versionText(artifact: ArtifactRef): string {
  const segments: string[] = [];
  if (artifact.currentVersionNo) {
    segments.push(`v${artifact.currentVersionNo}`);
  }
  if (artifact.versionCount) {
    segments.push(`${artifact.versionCount} 个版本`);
  }
  if (artifact.createdBy) {
    segments.push(`创建人 ${artifact.createdBy}`);
  }
  if (artifact.sourceRunId) {
    segments.push(`run ${artifact.sourceRunId}`);
  }
  return segments.join(' · ');
}
</script>

<style scoped>
.artifact-sidebar {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 96px);
  min-height: 560px;
  overflow: hidden;
}

.sidebar-toolbar {
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}

.sidebar-tabs {
  display: inline-flex;
  align-items: center;
  flex: 1 1 170px;
  gap: 4px;
  min-width: 0;
  padding: 3px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #f8fafc;
}

.sidebar-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.sidebar-tab:hover {
  color: #2563eb;
}

.sidebar-tab.active {
  background: #fff;
  color: #172033;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.sidebar-tab small {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #e8eef8;
  color: #475569;
  font-size: 12px;
  line-height: 18px;
}

.sidebar-tab.active small {
  background: #eff6ff;
  color: #2563eb;
}

.sidebar-tab small.warning {
  background: #fff7ed;
  color: #f97316;
}

.sidebar-content {
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px;
}

.sidebar-panel {
  height: 100%;
  min-height: 0;
}

.sidebar-scroll {
  height: 100%;
}

.sidebar-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-left: auto;
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

.artifact-main .version-line {
  color: #2563eb;
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

@media (max-width: 980px) {
  .artifact-sidebar {
    max-height: none;
    min-height: 0;
  }
}
</style>
