<template>
  <div v-if="workflow" class="detail-page">
    <section class="workspace-band">
      <div class="toolbar">
        <div>
          <strong>{{ workflow.title }}</strong>
          <p class="muted">需求号 {{ workflow.requirementId }} · {{ workflow.branchName || '未绑定分支' }}</p>
        </div>
        <div>
          <el-button :icon="Refresh" @click="runRefresh">刷新产物</el-button>
          <el-button :icon="Back" @click="$router.push('/')">返回列表</el-button>
        </div>
      </div>
      <StageTimeline v-model="activeStage" :workflow="workflow" />
    </section>

    <div class="stage-grid" style="margin-top: 16px">
      <main>
        <section class="workspace-band stage-panel">
          <div class="toolbar">
            <div>
              <strong>{{ stageLabels[activeStage] }}</strong>
              <p class="muted">{{ stageHint }}</p>
            </div>
            <div class="stage-toolbar-actions">
              <el-select v-model="selectedAgentId" style="width: 180px" placeholder="选择 Agent">
                <el-option v-for="agent in store.agents" :key="agent.id" :label="agent.name" :value="agent.id">
                  <span>{{ agent.name }}</span>
                  <span class="muted" style="float: right">{{ agent.available ? '可用' : '不可用' }}</span>
                </el-option>
              </el-select>
              <el-select v-model="selectedExecutionMode" style="width: 140px" placeholder="执行方式">
                <el-option label="后台执行" value="BACKGROUND" />
                <el-option label="本地终端" value="TERMINAL" />
              </el-select>
              <el-button :icon="DocumentChecked" @click="openReview">审核</el-button>
              <el-button v-if="currentStageRun" :icon="Tickets" @click="openRunLog(currentStageRun.id)">本步骤日志</el-button>
              <el-button v-if="currentStageRun?.status === 'RUNNING'" type="danger" @click="cancelRun(currentStageRun.id)">取消</el-button>
            </div>
          </div>

          <div class="stage-content">
            <div v-if="activeStage === 'PRD'" class="stage-actions">
              <el-input
                v-model="prdClarification"
                type="textarea"
                :rows="3"
                maxlength="500"
                show-word-limit
                placeholder="填写 PRD 澄清描述，对应 coding-prd-analyzer 的 c 参数，例如范围边界、排除项、业务前提"
              />
              <el-input v-model="sourceText" type="textarea" :rows="3" placeholder="填写外部 PRD 来源，每行一个，例如飞书、设计稿或在线文档链接" />
              <div class="prd-file-panel">
                <div class="action-line">
                  <input ref="prdFileInput" class="hidden-file-input" type="file" multiple accept=".pdf,.md,.markdown,image/*" @change="uploadPrdFiles" />
                  <el-button :icon="Upload" @click="choosePrdFiles">上传本地文件</el-button>
                  <span class="muted">支持 PDF、图片、Markdown，上传后快照到 PRD file 目录。</span>
                </div>
                <div v-if="prdSourceFiles.length" class="prd-file-list">
                  <div v-for="file in prdSourceFiles" :key="file.id" class="prd-file-item">
                    <div class="prd-file-meta">
                      <strong>{{ file.name }}</strong>
                      <small class="muted">{{ file.path }} · {{ formatFileSize(file.size) }}</small>
                    </div>
                    <el-button type="danger" link :icon="Delete" @click="deletePrdFile(file.id)">删除</el-button>
                  </div>
                </div>
              </div>
              <el-button type="primary" :icon="Operation" @click="runPrd">生成 PRD</el-button>
              <MarkdownEditor title="PRD 文档" :artifact-path="prdEditorPath" @saved="reload" />
            </div>

            <div v-else-if="activeStage === 'TECH_DESIGN'" class="stage-actions">
              <el-alert v-if="!prdApproved" type="warning" show-icon title="需要先通过 PRD 审核" />
              <el-descriptions :column="1" border class="design-source-summary">
                <el-descriptions-item label="PRD 文档">
                  <span class="design-source-path">{{ prdDesignSourcePath || '未关联' }}</span>
                </el-descriptions-item>
              </el-descriptions>
              <el-input
                v-model="designClarification"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
                placeholder="填写评审意见或补充说明，对应 coding-design 的 c 参数（可选），用于二次评审时提供修改建议"
              />
              <el-button type="primary" :disabled="!prdApproved || !prdDesignSourcePath" :icon="Operation" @click="runDesign">生成技术方案</el-button>
              <MarkdownEditor title="技术方案" :artifact-path="stageArtifactPath('TECH_DESIGN')" @saved="reload" />
            </div>

            <div v-else-if="activeStage === 'IMPLEMENTATION'" class="stage-actions">
              <div class="action-line">
                <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                <el-button :icon="DataAnalysis" @click="runOpenSpecStatus">查看 OpenSpec 状态</el-button>
                <el-button type="primary" :icon="Operation" @click="runOpenSpecVerify">发起验证</el-button>
              </div>
              <div class="action-line">
                <el-input v-model="moduleName" placeholder="单测模块，例如 opp-diy" />
                <el-button :icon="Cpu" @click="runJunit">生成/关联单测</el-button>
              </div>
              <el-descriptions :column="2" border>
                <el-descriptions-item label="OpenSpec">{{ openSpecSummary?.rootPath || stageArtifactPath('IMPLEMENTATION') || '未关联' }}</el-descriptions-item>
                <el-descriptions-item label="归档状态">
                  <el-tag :type="openSpecSummary?.archived ? 'success' : 'info'" size="small">
                    {{ openSpecSummary?.archived ? '已归档' : '进行中' }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="任务进度">{{ openSpecSummary ? `${openSpecSummary.tasks.completed} / ${openSpecSummary.tasks.total}` : '未读取' }}</el-descriptions-item>
                <el-descriptions-item label="待处理问题">{{ workflow.issues.filter((item) => item.status === 'OPEN').length }}</el-descriptions-item>
              </el-descriptions>
              <section class="openspec-section">
                <div class="section-title">
                  <strong>任务完成情况</strong>
                  <span class="muted">{{ openSpecSummary ? `${openSpecTaskPercentage}%` : '未读取' }}</span>
                </div>
                <el-progress :percentage="openSpecTaskPercentage" />
                <div v-if="openSpecSummary?.tasks.groups.length" class="openspec-task-list">
                  <section v-for="group in openSpecSummary.tasks.groups" :key="group.title" class="openspec-task-group">
                    <strong>{{ group.title }}</strong>
                    <div v-for="task in group.items" :key="`${group.title}-${task.line}`" class="openspec-task-row" :class="{ done: task.completed }">
                      <el-checkbox
                        :model-value="task.completed"
                        :disabled="openSpecSummary?.archived"
                        @change="(value) => toggleOpenSpecTask(task, value === true)"
                      />
                      <span class="openspec-task-id">{{ task.id || '-' }}</span>
                      <span>{{ task.title }}</span>
                    </div>
                  </section>
                </div>
                <el-empty v-else description="暂无任务" />
              </section>
              <div v-if="openSpecDocuments.length" class="openspec-preview-tabs">
                <div class="section-title">
                  <strong>OpenSpec 文档预览</strong>
                  <span class="muted">{{ selectedOpenSpecDocPath || openSpecSummary?.rootPath || '未关联' }}</span>
                </div>
                <el-tabs v-model="selectedOpenSpecDocPath" class="openspec-doc-tabs">
                  <el-tab-pane v-for="doc in openSpecDocuments" :key="doc.id" :label="doc.label" :name="doc.path" :disabled="!doc.exists" />
                </el-tabs>
              </div>
              <MarkdownEditor
                v-if="selectedOpenSpecDocPath"
                :key="`${selectedOpenSpecDocPath}-${openSpecPreviewVersion}`"
                title="OpenSpec 文档预览"
                :artifact-path="selectedOpenSpecDocPath"
                @saved="reload"
              />
            </div>

            <div v-else class="stage-actions">
              <div class="action-line">
                <el-input v-model="branchName" placeholder="分支名，例如 feature/opp-172014" />
                <el-button type="primary" :icon="Operation" @click="runCodeReview">生成代码评审</el-button>
                <el-button type="danger" :icon="Back" @click="returnToImplementation">打回实施</el-button>
                <el-button v-if="canArchiveOpenSpec" type="success" :icon="DocumentChecked" @click="runOpenSpecArchive">归档 OpenSpec</el-button>
              </div>
              <el-alert v-if="openSpecSummary?.archived" type="success" show-icon :title="`OpenSpec 已归档：${openSpecSummary.archivePath}`" />
              <MarkdownEditor title="代码评审汇总" :artifact-path="stageArtifactPath('CODE_REVIEW')" @saved="reload" />
            </div>
          </div>
        </section>
      </main>

      <ArtifactSidebar :artifacts="workflow.artifacts" :issues="workflow.issues" @refresh="runRefresh" @select="selectArtifact" />
    </div>

    <ReviewDialog ref="reviewDialog" @submit="submitReview" />
    <RunLogDrawer ref="runLogDrawer" :events="store.runEvents" />
  </div>
  <el-empty v-else description="需求加载中" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Back, Cpu, DataAnalysis, Delete, DocumentChecked, Operation, Refresh, Tickets, Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { ExecutionMode, OpenSpecSummary, OpenSpecTaskItem, RunRecord, WorkflowStage } from '@shared/workflow';
import { stageForAction, stageLabels } from '@shared/workflow';
import StageTimeline from '@/components/StageTimeline.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import ReviewDialog from '@/components/ReviewDialog.vue';
import RunLogDrawer from '@/components/RunLogDrawer.vue';
import ArtifactSidebar from '@/components/ArtifactSidebar.vue';
import { useWorkflowStore } from '@/stores/workflow';
import { apiClient } from '@/api/client';

const route = useRoute();
const store = useWorkflowStore();
const activeStage = ref<WorkflowStage>('PRD');
const reviewDialog = ref<InstanceType<typeof ReviewDialog>>();
const runLogDrawer = ref<InstanceType<typeof RunLogDrawer>>();
const prdFileInput = ref<HTMLInputElement>();
const selectedArtifactPath = ref('');
const sourceText = ref('');
const prdClarification = ref('');
const changeName = ref('');
const moduleName = ref('');
const branchName = ref('');
const selectedAgentId = ref('codex');
const selectedExecutionMode = ref<ExecutionMode>('BACKGROUND');
const designClarification = ref('');
const openSpecSummary = ref<OpenSpecSummary>();
const selectedOpenSpecDocPath = ref('');
const openSpecPreviewVersion = ref(0);

const workflow = computed(() => store.current);
const currentStageRun = computed<RunRecord | undefined>(() =>
  workflow.value?.runs.find((run) => (run.stage || stageForAction(run.actionType)) === activeStage.value)
);
const prdSourceFiles = computed(() => workflow.value?.prdSourceFiles || []);
const prdApproved = computed(() => workflow.value?.stages.PRD.status === 'APPROVED');
const openSpecDocuments = computed(() => [...(openSpecSummary.value?.artifacts || []), ...(openSpecSummary.value?.specs || [])]);
const openSpecTaskPercentage = computed(() => {
  const total = openSpecSummary.value?.tasks.total || 0;
  if (!total) {
    return 0;
  }
  return Math.round(((openSpecSummary.value?.tasks.completed || 0) / total) * 100);
});
const canArchiveOpenSpec = computed(() => Boolean(workflow.value?.stages.CODE_REVIEW.status === 'APPROVED' && !openSpecSummary.value?.archived));
const prdEditorPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  const selected = workflow.value.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
  if (selected?.stage === 'PRD' && selected.kind !== 'directory') {
    return selected.path;
  }
  return stageArtifactPath('PRD') || workflow.value.stages.PRD.artifactPath || `docs/${workflow.value.requirementId}/prd/analysis.md`;
});
const prdDesignSourcePath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  return prdEditorPath.value;
});
const stageHint = computed(() => {
  const hints: Record<WorkflowStage, string> = {
    PRD: '产品生成并二次编辑 PRD，审核通过后进入技术方案。',
    TECH_DESIGN: '架构师生成技术方案，审核通过后解锁实施。',
    IMPLEMENTATION: '查看 OpenSpec 状态、发起验证和单元测试报告。',
    CODE_REVIEW: '按分支生成评审报告，阻断问题可打回实施阶段。'
  };
  return hints[activeStage.value];
});

function stageArtifactPath(stage: WorkflowStage) {
  if (selectedArtifactPath.value) {
    const selected = workflow.value?.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
    if (selected?.stage === stage && selected.exists && selected.kind !== 'directory') {
      return selected.path;
    }
  }
  return workflow.value?.artifacts.find((artifact) => artifact.stage === stage && artifact.exists && artifact.kind !== 'directory')?.path;
}

async function reload() {
  if (typeof route.params.requirementId === 'string') {
    await store.loadRequirement(route.params.requirementId);
    await loadOpenSpecSummary();
  }
}

async function loadOpenSpecSummary() {
  if (!workflow.value) {
    return;
  }
  const summary = await apiClient.getOpenSpecSummary(workflow.value.requirementId, changeName.value || `req-${workflow.value.requirementId}`);
  openSpecSummary.value = summary;
  const selectedStillExists = openSpecDocuments.value.some((doc) => doc.path === selectedOpenSpecDocPath.value && doc.exists);
  if (!selectedStillExists) {
    selectedOpenSpecDocPath.value = openSpecDocuments.value.find((doc) => doc.exists)?.path || '';
  }
}

function selectArtifact(path: string) {
  selectedArtifactPath.value = path;
  const artifact = workflow.value?.artifacts.find((item) => item.path === path);
  if (artifact) {
    activeStage.value = artifact.stage;
  }
}

async function runRefresh() {
  await store.runAction({ actionType: 'REFRESH_ARTIFACTS' });
  await loadOpenSpecSummary();
  ElMessage.success('产物索引已刷新');
}

async function runPrd() {
  const textSources = sourceText.value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const fileSources = prdSourceFiles.value.map((file) => file.path);
  await store.runAction({
    actionType: 'PRD_ANALYZE',
    params: {
      ...agentActionParams(),
      description: prdClarification.value,
      sources: [...new Set([...textSources, ...fileSources])]
    }
  });
}

function choosePrdFiles() {
  prdFileInput.value?.click();
}

async function uploadPrdFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) {
    return;
  }
  await store.uploadPrdFiles(files);
  input.value = '';
  ElMessage.success('PRD 来源文件已上传');
}

async function deletePrdFile(fileId: string) {
  await store.deletePrdFile(fileId);
  ElMessage.success('PRD 来源文件已删除');
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function agentActionParams() {
  return {
    agentId: selectedAgentId.value,
    executionMode: selectedExecutionMode.value
  };
}

async function runDesign() {
  const documentPath = prdDesignSourcePath.value.trim();
  if (!prdApproved.value) {
    ElMessage.warning('请先通过 PRD 审核');
    return;
  }
  if (!documentPath) {
    ElMessage.warning('未找到 PRD 文档，请先刷新产物');
    return;
  }
  await store.runAction({
    actionType: 'DESIGN_GENERATE',
    params: {
      ...agentActionParams(),
      documentPath,
      clarification: designClarification.value.trim()
    }
  });
}

async function runOpenSpecStatus() {
  await store.runAction({ actionType: 'OPENSPEC_STATUS', params: { changeName: changeName.value } });
  await loadOpenSpecSummary();
}

async function runOpenSpecVerify() {
  await store.runAction({ actionType: 'OPENSPEC_VERIFY', params: { ...agentActionParams(), changeName: changeName.value } });
  await loadOpenSpecSummary();
}

async function runJunit() {
  await store.runAction({ actionType: 'JUNIT_GENERATE', params: { ...agentActionParams(), moduleName: moduleName.value } });
}

async function runCodeReview() {
  await store.runAction({ actionType: 'CODE_REVIEW', params: { ...agentActionParams(), branchName: branchName.value } });
}

async function runOpenSpecArchive() {
  await store.runAction({ actionType: 'OPENSPEC_ARCHIVE', params: { ...agentActionParams(), changeName: changeName.value } });
  await loadOpenSpecSummary();
}

async function returnToImplementation() {
  await store.runAction({ actionType: 'RETURN_TO_IMPLEMENTATION' });
  activeStage.value = 'IMPLEMENTATION';
}

async function toggleOpenSpecTask(task: OpenSpecTaskItem, completed: boolean) {
  if (!workflow.value || openSpecSummary.value?.archived) {
    return;
  }
  try {
    openSpecSummary.value = await apiClient.updateOpenSpecTask(workflow.value.requirementId, {
      changeName: changeName.value || `req-${workflow.value.requirementId}`,
      line: task.line,
      completed,
      raw: task.raw
    });
    openSpecPreviewVersion.value += 1;
    ElMessage.success(completed ? '任务已确认完成' : '任务已取消完成');
  } catch (error: any) {
    ElMessage.error(error.message || '任务状态更新失败');
    await loadOpenSpecSummary();
  }
}

function openReview() {
  reviewDialog.value?.open(activeStage.value, activeStage.value === 'PRD' ? prdEditorPath.value : stageArtifactPath(activeStage.value));
}

async function submitReview(input: { stage: WorkflowStage; decision: 'APPROVED' | 'REJECTED' | 'RISK_ACCEPTED'; comment: string; artifactPath?: string }) {
  await store.submitReview(input);
  ElMessage.success('审核记录已保存');
}

async function openRunLog(runId: string) {
  await store.loadRunEvents(runId);
  store.streamRunEvents(runId);
  runLogDrawer.value?.open();
}

async function cancelRun(runId: string) {
  await store.cancelRun(runId);
  ElMessage.success('已发送取消请求');
}

watch(
  workflow,
  (value) => {
    if (!value) {
      return;
    }
    const uploadedPaths = new Set((value.prdSourceFiles || []).map((file) => file.path));
    sourceText.value = value.sources.filter((source) => !uploadedPaths.has(source)).join('\n');
    prdClarification.value = value.prdClarification || '';
    changeName.value = value.stages.IMPLEMENTATION.changeName || `req-${value.requirementId}`;
    moduleName.value = moduleName.value || '';
    branchName.value = value.branchName || '';
    designClarification.value = value.techDesignClarification || '';
    void loadOpenSpecSummary();
    activeStage.value = value.currentStage === 'DONE' ? 'CODE_REVIEW' : value.currentStage;
  },
  { immediate: true }
);

onMounted(async () => {
  await store.loadAgents();
  await reload();
});
</script>

<style scoped>
.detail-page {
  display: grid;
  gap: 16px;
}

.stage-content {
  padding: 14px;
}

.stage-actions {
  display: grid;
  gap: 14px;
}

.action-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-line .el-input {
  max-width: 360px;
}

.design-source-summary {
  max-width: 100%;
}

.design-source-path {
  overflow-wrap: anywhere;
}

.openspec-section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
}

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

.openspec-doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.openspec-doc-row {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #ffffff;
  color: #172033;
  text-align: left;
  cursor: pointer;
}

.openspec-doc-row.active {
  border-color: #2563eb;
  background: #f0f6ff;
}

.openspec-doc-row.missing {
  color: #8a96a8;
  cursor: not-allowed;
}

.openspec-doc-row span,
.openspec-doc-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.openspec-doc-row small {
  color: #697891;
}

.openspec-task-list {
  display: grid;
  gap: 12px;
  max-height: 360px;
  overflow: auto;
}

.openspec-task-group {
  display: grid;
  gap: 6px;
}

.openspec-task-row {
  display: grid;
  grid-template-columns: 28px 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #eef2f7;
  border-radius: 6px;
}

.openspec-task-row.done {
  background: #f6fbf8;
  color: #52637a;
}

.openspec-task-id {
  color: #697891;
  font-variant-numeric: tabular-nums;
}

.stage-toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.hidden-file-input {
  display: none;
}

.prd-file-panel {
  display: grid;
  gap: 10px;
}

.prd-file-list {
  display: grid;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
}

.prd-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid #e3e8f2;
}

.prd-file-item:last-child {
  border-bottom: 0;
}

.prd-file-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.prd-file-meta strong,
.prd-file-meta small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .action-line {
    align-items: stretch;
    flex-direction: column;
  }

  .action-line .el-input {
    max-width: none;
  }

  .stage-toolbar-actions {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }
}
</style>
