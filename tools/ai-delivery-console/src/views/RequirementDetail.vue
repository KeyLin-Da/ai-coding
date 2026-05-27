<template>
  <div v-if="workflow" class="detail-page">
    <section class="workspace-band requirement-hero">
      <div class="requirement-hero-top">
        <div class="requirement-breadcrumb">
          <span>需求</span>
          <span>/</span>
          <strong>{{ workflow.requirementId }}</strong>
        </div>
        <div class="requirement-hero-actions">
          <el-button :icon="Refresh" @click="runRefresh">刷新产物</el-button>
          <el-button :icon="Back" @click="$router.push('/')">返回列表</el-button>
        </div>
      </div>
      <h2 class="requirement-title">{{ workflow.title }}</h2>
      <div class="requirement-meta">
        <el-tag size="small" :type="requirementTypeTagType(workflow.requirementType)" effect="light">{{ requirementTypeText }}</el-tag>
        <el-tag size="small" :type="statusTagType(workflow.status)" effect="light">{{ statusLabels[workflow.status] }}</el-tag>
        <span class="branch-pill">{{ workflow.branchName || '未绑定分支' }}</span>
      </div>
      <StageTimeline v-model="activeStage" :workflow="workflow" />
    </section>

    <div class="stage-grid">
      <main>
        <section class="workspace-band stage-panel">
          <div class="toolbar stage-panel-header">
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
                <el-option label="交互终端" value="INTERACTIVE_TERMINAL" />
                <el-option label="手动复制" value="MANUAL_COPY" />
              </el-select>
              <el-button v-if="activeStage !== 'IMPLEMENTATION'" :icon="DocumentChecked" @click="openReview">审核</el-button>
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
              <el-button type="primary" :icon="primaryActionIcon(Operation)" @click="runPrd">{{ actionButtonText('生成 PRD') }}</el-button>
              <MarkdownEditor title="PRD 文档" :artifact-path="prdEditorPath" @saved="reload" />
            </div>

            <div v-else-if="activeStage === 'TECH_DESIGN'" class="stage-actions">
              <el-alert v-if="!prdApproved" type="warning" show-icon title="需要先通过 PRD 审核" />
              <el-descriptions :column="1" border class="design-source-summary">
                <el-descriptions-item label="PRD 文档">
                  <span class="design-source-path">{{ prdDesignSourcePath || '未关联' }}</span>
                </el-descriptions-item>
              </el-descriptions>
              <div class="prd-file-panel">
                <div class="action-line">
                  <input
                    ref="techDesignFileInput"
                    class="hidden-file-input"
                    type="file"
                    multiple
                    accept=".pdf,.md,.markdown,image/*"
                    @change="uploadTechDesignFiles"
                  />
                  <el-button :disabled="!prdApproved" :icon="Upload" @click="chooseTechDesignFiles">上传补充材料</el-button>
                  <span class="muted">支持 PDF、图片、Markdown，上传后快照到 technical-design/file 目录并追加到 d 参数。</span>
                </div>
                <div v-if="techDesignSourceFiles.length" class="prd-file-list">
                  <div v-for="file in techDesignSourceFiles" :key="file.id" class="prd-file-item">
                    <div class="prd-file-meta">
                      <strong>{{ file.name }}</strong>
                      <small class="muted">{{ file.path }} · {{ formatFileSize(file.size) }}</small>
                    </div>
                    <el-button type="danger" link :icon="Delete" @click="deleteTechDesignFile(file.id)">删除</el-button>
                  </div>
                </div>
              </div>
              <el-input
                v-model="designClarification"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
                placeholder="填写评审意见或补充说明，对应 coding-design 的 c 参数（可选），用于二次评审时提供修改建议"
              />
              <el-button type="primary" :disabled="!prdApproved || !prdDesignSourcePath" :icon="primaryActionIcon(Operation)" @click="runDesign">
                {{ actionButtonText('生成技术方案') }}
              </el-button>
              <MarkdownEditor title="技术方案" :artifact-path="stageArtifactPath('TECH_DESIGN')" @saved="reload" />
            </div>

            <div v-else-if="activeStage === 'IMPLEMENTATION'" class="stage-actions">
              <nav class="implementation-step-nav" aria-label="实施验证子步骤">
                <button
                  v-for="(step, index) in implementationStepItems"
                  :key="step.step"
                  class="implementation-step-button"
                  :class="{ active: activeImplementationStep === step.step, approved: step.status === 'APPROVED' }"
                  type="button"
                  @click="activeImplementationStep = step.step"
                >
                  <span class="step-index">{{ index + 1 }}</span>
                  <span class="step-main">
                    <strong>{{ step.label }}</strong>
                    <small>{{ statusLabels[step.status] }}</small>
                  </span>
                </button>
              </nav>
              <section class="implementation-summary-strip" aria-label="实施验证摘要">
                <div class="summary-main">
                  <div class="summary-heading">
                    <strong>OpenSpec</strong>
                    <el-tag :type="openSpecSummary?.archived ? 'success' : 'primary'" size="small" effect="light">
                      {{ implementationArchiveStatus }}
                    </el-tag>
                  </div>
                  <p class="summary-path">{{ implementationOpenSpecPath }}</p>
                  <el-progress :percentage="openSpecTaskPercentage" :stroke-width="8" />
                </div>
                <div class="summary-metrics">
                  <span class="metric-card done">
                    <small>已完成</small>
                    <strong>{{ openSpecSummary?.tasks.completed || 0 }}</strong>
                  </span>
                  <span class="metric-card pending">
                    <small>待完成</small>
                    <strong>{{ openSpecPendingTaskCount }}</strong>
                  </span>
                  <span class="metric-card issue">
                    <small>问题</small>
                    <strong>{{ openIssueCount }}</strong>
                  </span>
                  <span class="metric-card total">
                    <small>总任务</small>
                    <strong>{{ openSpecSummary?.tasks.total || 0 }}</strong>
                  </span>
                </div>
              </section>

              <template v-if="activeImplementationStep === 'ARTIFACT_REVIEW'">
                <div class="action-line">
                  <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                  <el-button type="primary" :disabled="!techDesignApproved" :icon="primaryActionIcon(Operation)" @click="runOpenSpecArtifacts">
                    {{ actionButtonText('生成 OpenSpec 工件') }}
                  </el-button>
                  <el-button :icon="primaryActionIcon(DataAnalysis)" @click="runOpenSpecStatus">{{ actionButtonText('查看 OpenSpec 状态') }}</el-button>
                  <el-button :icon="DocumentChecked" @click="openReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!techDesignApproved" type="warning" show-icon title="需要先通过技术方案审核" />
                <OpenSpecDocuments
                  v-if="openSpecDocuments.length"
                  v-model="selectedOpenSpecDocPath"
                  :documents="openSpecDocuments"
                  :root-path="openSpecSummary?.rootPath"
                />
              </template>

              <template v-if="activeImplementationStep === 'APPLY'">
                <div class="action-line">
                  <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                  <el-button type="primary" :disabled="!canRunOpenSpecApply" :icon="primaryActionIcon(Operation)" @click="runOpenSpecApply">
                    {{ actionButtonText('开始实施') }}
                  </el-button>
                  <el-button :disabled="!canRunOpenSpecApply" :icon="primaryActionIcon(DataAnalysis)" @click="runOpenSpecVerify">
                    {{ actionButtonText('发起验证') }}
                  </el-button>
                  <el-button :icon="DocumentChecked" @click="openReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!canRunOpenSpecApply" type="warning" show-icon title="请先通过 OpenSpec 工件评审" />
              </template>

              <section v-if="activeImplementationStep === 'APPLY'" class="openspec-section">
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

              <template v-if="activeImplementationStep === 'CHANGE_INSPECTION'">
                <div class="action-line">
                  <el-button :icon="Refresh" @click="loadGitChanges">刷新变更</el-button>
                  <el-button :disabled="!canInspectChanges" :icon="DocumentChecked" @click="openReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!canInspectChanges" type="warning" show-icon title="请先完成并审核开始实施步骤" />
                <GitChangeInspector :summary="gitChanges" />
              </template>

              <template v-if="activeImplementationStep === 'UNIT_TEST'">
                <div class="action-line">
                  <el-input v-model="moduleName" placeholder="单测模块，例如 opp-diy" />
                  <el-button :disabled="!canRunJunit" :icon="primaryActionIcon(Cpu)" @click="runJunit">{{ actionButtonText('执行单测并生成报告') }}</el-button>
                  <el-button :icon="DocumentChecked" @click="openReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!canRunJunit" type="warning" show-icon title="请先通过变更文件及代码审核" />
                <MarkdownEditor title="单元测试报告" :artifact-path="junitArtifactPath" @saved="reload" />
              </template>

              <MarkdownEditor
                v-if="selectedOpenSpecDocPath && activeImplementationStep === 'ARTIFACT_REVIEW'"
                :key="`${selectedOpenSpecDocPath}-${openSpecPreviewVersion}`"
                title="文档内容"
                :artifact-path="selectedOpenSpecDocPath"
                @saved="reload"
              />
            </div>

            <div v-else class="stage-actions">
              <div class="action-line">
                <el-input v-model="branchName" placeholder="分支名，例如 feature/opp-172014" />
                <el-button type="primary" :icon="primaryActionIcon(Operation)" @click="runCodeReview">{{ actionButtonText('生成代码评审') }}</el-button>
                <el-button type="danger" :icon="Back" @click="returnToImplementation">打回实施</el-button>
                <el-button v-if="canArchiveOpenSpec" type="success" :icon="primaryActionIcon(DocumentChecked)" @click="runOpenSpecArchive">
                  {{ actionButtonText('归档 OpenSpec') }}
                </el-button>
              </div>
              <el-alert v-if="openSpecSummary?.archived" type="success" show-icon :title="`OpenSpec 已归档：${openSpecSummary.archivePath}`" />
              <MarkdownEditor title="代码评审汇总" :artifact-path="stageArtifactPath('CODE_REVIEW')" @saved="reload" />
            </div>
          </div>
        </section>
      </main>

      <ArtifactSidebar :artifacts="workflow.artifacts" :issues="workflow.issues" @refresh="runRefresh" @select="previewArtifact" />
    </div>

    <ReviewDialog ref="reviewDialog" @submit="submitReview" />
    <RunLogDrawer ref="runLogDrawer" :events="store.runEvents" />
    <ArtifactPreviewDialog ref="artifactPreviewDialog" />
  </div>
  <el-empty v-else description="需求加载中" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Back, CopyDocument, Cpu, DataAnalysis, Delete, DocumentChecked, Operation, Refresh, Tickets, Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type {
  ActionInput,
  ArtifactRef,
  ExecutionMode,
  GitChangeSummary,
  ImplementationStep,
  OpenSpecSummary,
  OpenSpecTaskItem,
  RequirementType,
  RunRecord,
  WorkflowStage,
  WorkflowStatus
} from '@shared/workflow';
import {
  ensureImplementationSteps,
  implementationStepForAction,
  implementationStepLabels,
  implementationSteps,
  requirementTypeLabels,
  stageForAction,
  stageLabels,
  statusLabels
} from '@shared/workflow';
import StageTimeline from '@/components/StageTimeline.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import OpenSpecDocuments from '@/components/OpenSpecDocuments.vue';
import ReviewDialog from '@/components/ReviewDialog.vue';
import RunLogDrawer from '@/components/RunLogDrawer.vue';
import ArtifactSidebar from '@/components/ArtifactSidebar.vue';
import ArtifactPreviewDialog from '@/components/ArtifactPreviewDialog.vue';
import GitChangeInspector from '@/components/GitChangeInspector.vue';
import { useWorkflowStore } from '@/stores/workflow';
import { apiClient } from '@/api/client';

const route = useRoute();
const store = useWorkflowStore();
const activeStage = ref<WorkflowStage>('PRD');
const reviewDialog = ref<InstanceType<typeof ReviewDialog>>();
const runLogDrawer = ref<InstanceType<typeof RunLogDrawer>>();
const artifactPreviewDialog = ref<InstanceType<typeof ArtifactPreviewDialog>>();
const prdFileInput = ref<HTMLInputElement>();
const techDesignFileInput = ref<HTMLInputElement>();
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
const activeImplementationStep = ref<ImplementationStep>('ARTIFACT_REVIEW');
const gitChanges = ref<GitChangeSummary>();

const workflow = computed(() => store.current);
const implementationStepStates = computed(() => ensureImplementationSteps(workflow.value?.implementationSteps));
const currentStageRun = computed<RunRecord | undefined>(() => {
  if (activeStage.value === 'IMPLEMENTATION') {
    return workflow.value?.runs.find(
      (run) =>
        (run.stage || stageForAction(run.actionType)) === 'IMPLEMENTATION' &&
        (run.implementationStep || implementationStepForAction(run.actionType)) === activeImplementationStep.value
    );
  }
  return workflow.value?.runs.find((run) => (run.stage || stageForAction(run.actionType)) === activeStage.value);
});
const prdSourceFiles = computed(() => workflow.value?.prdSourceFiles || []);
const techDesignSourceFiles = computed(() => workflow.value?.techDesignSourceFiles || []);
const prdApproved = computed(() => workflow.value?.stages.PRD.status === 'APPROVED');
const techDesignApproved = computed(() => workflow.value?.stages.TECH_DESIGN.status === 'APPROVED');
const openSpecDocuments = computed(() => [...(openSpecSummary.value?.artifacts || []), ...(openSpecSummary.value?.specs || [])]);
const implementationStepItems = computed(() =>
  implementationSteps.map((step) => ({
    ...implementationStepStates.value[step],
    label: implementationStepLabels[step]
  }))
);
const openSpecTaskPercentage = computed(() => {
  const total = openSpecSummary.value?.tasks.total || 0;
  if (!total) {
    return 0;
  }
  return Math.round(((openSpecSummary.value?.tasks.completed || 0) / total) * 100);
});
const openSpecPendingTaskCount = computed(() => Math.max(0, (openSpecSummary.value?.tasks.total || 0) - (openSpecSummary.value?.tasks.completed || 0)));
const canArchiveOpenSpec = computed(() => Boolean(workflow.value?.stages.CODE_REVIEW.status === 'APPROVED' && !openSpecSummary.value?.archived));
const canRunOpenSpecApply = computed(() => implementationStepStates.value.ARTIFACT_REVIEW.status === 'APPROVED');
const canInspectChanges = computed(() => implementationStepStates.value.APPLY.status === 'APPROVED');
const canRunJunit = computed(() => implementationStepStates.value.CHANGE_INSPECTION.status === 'APPROVED');
const openIssueCount = computed(() => workflow.value?.issues.filter((item) => item.status === 'OPEN').length || 0);
const implementationOpenSpecPath = computed(() => openSpecSummary.value?.rootPath || stageArtifactPath('IMPLEMENTATION') || '未关联');
const implementationArchiveStatus = computed(() => (openSpecSummary.value?.archived ? '已归档' : '进行中'));
const requirementTypeText = computed(() => requirementTypeLabels[workflow.value?.requirementType || 'REQUIREMENT']);
const junitArtifactPath = computed(
  () =>
    workflow.value?.artifacts.find((artifact) => artifact.stage === 'IMPLEMENTATION' && artifact.exists && artifact.kind !== 'directory' && artifact.path.includes('/junit/'))?.path ||
    ''
);
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
const openSpecPrdDocumentPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  const selected = workflow.value.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
  if (selected?.stage === 'PRD' && selected.exists && selected.kind !== 'directory') {
    return selected.path;
  }
  return stageArtifactPath('PRD') || workflow.value.stages.PRD.artifactPath || '';
});
const openSpecTechnicalDesignDocumentPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  return stageArtifactPath('TECH_DESIGN') || workflow.value.stages.TECH_DESIGN.artifactPath || '';
});
const stageHint = computed(() => {
  const hints: Record<WorkflowStage, string> = {
    PRD: '产品生成并二次编辑 PRD，审核通过后进入技术方案。',
    TECH_DESIGN: '架构师生成技术方案，审核通过后解锁实施。',
    IMPLEMENTATION: `实施验证分步骤推进：${implementationStepLabels[activeImplementationStep.value]}。`,
    CODE_REVIEW: '按分支生成评审报告，阻断问题可打回实施阶段。'
  };
  return hints[activeStage.value];
});
const manualCopyMode = computed(() => selectedExecutionMode.value === 'MANUAL_COPY');

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

function previewArtifact(artifact: ArtifactRef) {
  artifactPreviewDialog.value?.open(artifact);
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
  await runOrCopyAction({
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

function chooseTechDesignFiles() {
  techDesignFileInput.value?.click();
}

async function uploadTechDesignFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) {
    return;
  }
  await store.uploadTechDesignFiles(files);
  input.value = '';
  ElMessage.success('技术方案补充材料已上传');
}

async function deleteTechDesignFile(fileId: string) {
  await store.deleteTechDesignFile(fileId);
  ElMessage.success('技术方案补充材料已删除');
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

function actionButtonText(label: string) {
  return manualCopyMode.value ? `复制${label}命令` : label;
}

function primaryActionIcon(icon: unknown) {
  return manualCopyMode.value ? CopyDocument : icon;
}

function requirementTypeTagType(type?: RequirementType) {
  return type === 'DEFECT' ? 'primary' : 'success';
}

function statusTagType(status?: WorkflowStatus) {
  if (status === 'APPROVED' || status === 'DONE') {
    return 'success';
  }
  if (status === 'REJECTED' || status === 'BLOCKED') {
    return 'danger';
  }
  if (status === 'IN_PROGRESS' || status === 'IN_REVIEW') {
    return 'primary';
  }
  if (status === 'READY_FOR_REVIEW') {
    return 'warning';
  }
  return 'info';
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

async function runOrCopyAction(action: ActionInput, afterRun?: () => Promise<void>) {
  if (!workflow.value) {
    return;
  }
  if (manualCopyMode.value) {
    const { commandText } = await apiClient.previewActionCommand(workflow.value.requirementId, action);
    await copyToClipboard(commandText);
    ElMessage.success('命令已复制');
    return;
  }
  await store.runAction(action);
  await afterRun?.();
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
  await runOrCopyAction({
    actionType: 'DESIGN_GENERATE',
    params: {
      ...agentActionParams(),
      documentPath,
      sourceFiles: techDesignSourceFiles.value.map((file) => file.path),
      clarification: designClarification.value.trim()
    }
  });
}

async function runOpenSpecStatus() {
  await runOrCopyAction({ actionType: 'OPENSPEC_STATUS', params: { changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runOpenSpecArtifacts() {
  if (!techDesignApproved.value) {
    ElMessage.warning('请先通过技术方案审核');
    return;
  }
  const prdDocumentPath = openSpecPrdDocumentPath.value.trim();
  const documentPath = openSpecTechnicalDesignDocumentPath.value.trim();
  if (!prdDocumentPath) {
    ElMessage.warning('请先生成、保存或刷新 PRD 产物');
    return;
  }
  if (!documentPath) {
    ElMessage.warning('请先生成、保存或刷新技术方案产物');
    return;
  }
  await runOrCopyAction(
    {
      actionType: 'OPENSPEC_FF',
      params: {
        ...agentActionParams(),
        changeName: changeName.value,
        prdDocumentPath,
        documentPath
      }
    },
    loadOpenSpecSummary
  );
}

async function runOpenSpecApply() {
  if (!canRunOpenSpecApply.value) {
    ElMessage.warning('请先通过 OpenSpec 工件评审');
    return;
  }
  await runOrCopyAction({ actionType: 'OPENSPEC_APPLY', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runOpenSpecVerify() {
  await runOrCopyAction({ actionType: 'OPENSPEC_VERIFY', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runJunit() {
  if (!canRunJunit.value) {
    ElMessage.warning('请先通过变更文件及代码审核');
    return;
  }
  await runOrCopyAction({ actionType: 'JUNIT_GENERATE', params: { ...agentActionParams(), moduleName: moduleName.value } });
}

async function loadGitChanges() {
  if (!workflow.value) {
    return;
  }
  try {
    gitChanges.value = await apiClient.getGitChanges(workflow.value.requirementId);
  } catch (error: any) {
    ElMessage.error(error.message || '读取 Git 变更失败');
  }
}

async function runCodeReview() {
  await runOrCopyAction({ actionType: 'CODE_REVIEW', params: { ...agentActionParams(), branchName: branchName.value } });
}

async function runOpenSpecArchive() {
  await runOrCopyAction({ actionType: 'OPENSPEC_ARCHIVE', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
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

function implementationReviewArtifactPath() {
  if (activeImplementationStep.value === 'UNIT_TEST') {
    return junitArtifactPath.value;
  }
  if (activeImplementationStep.value === 'ARTIFACT_REVIEW' || activeImplementationStep.value === 'APPLY') {
    return selectedOpenSpecDocPath.value || stageArtifactPath('IMPLEMENTATION');
  }
  return undefined;
}

function openReview() {
  const path =
    activeStage.value === 'PRD'
      ? prdEditorPath.value
      : activeStage.value === 'IMPLEMENTATION'
        ? implementationReviewArtifactPath()
        : stageArtifactPath(activeStage.value);
  reviewDialog.value?.open(activeStage.value, path, activeStage.value === 'IMPLEMENTATION' ? activeImplementationStep.value : undefined);
}

async function submitReview(input: {
  stage: WorkflowStage;
  implementationStep?: ImplementationStep;
  decision: 'APPROVED' | 'REJECTED' | 'RISK_ACCEPTED';
  comment: string;
  artifactPath?: string;
}) {
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

watch(activeImplementationStep, (step) => {
  if (step === 'CHANGE_INSPECTION') {
    void loadGitChanges();
  }
});

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

.detail-page > *,
.stage-grid > * {
  min-width: 0;
}

.requirement-hero {
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.requirement-hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 16px 8px;
}

.requirement-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #64748b;
  font-size: 13px;
}

.requirement-breadcrumb strong {
  color: #334155;
  font-weight: 600;
}

.requirement-hero-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
}

.requirement-title {
  margin: 0;
  padding: 0 16px;
  color: #111827;
  font-size: 20px;
  font-weight: 650;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.requirement-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px 14px;
}

.branch-pill {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  color: #475569;
  background: #f8fafc;
  font-size: 12px;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-grid {
  margin-top: 0;
}

.stage-panel {
  overflow: hidden;
}

.stage-panel-header {
  background: #fff;
}

.stage-content {
  padding: 16px;
}

.stage-actions {
  display: grid;
  gap: 14px;
}

.detail-page .toolbar > div {
  min-width: 0;
}

.detail-page .toolbar strong,
.detail-page .toolbar .muted {
  overflow-wrap: anywhere;
}

.action-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-line .el-input {
  max-width: 360px;
}

.implementation-step-nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 10px;
}

.implementation-step-button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 68px;
  padding: 12px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  color: #1f2a3d;
  text-align: left;
  cursor: pointer;
}

.implementation-step-button.active {
  border-color: #2563eb;
  background: #f8fbff;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.implementation-step-button.approved .step-index {
  background: #16a36a;
}

.implementation-summary-strip {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.summary-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.summary-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.summary-path {
  margin: 0;
  min-width: 0;
  color: #64748b;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(72px, 1fr));
  gap: 10px;
  min-width: 360px;
}

.metric-card {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-left: 1px solid #e3e8f2;
}

.metric-card small {
  color: #64748b;
  font-size: 12px;
}

.metric-card strong {
  color: #172033;
  font-size: 20px;
  line-height: 1.15;
}

.metric-card.done strong {
  color: #16a36a;
}

.metric-card.pending strong {
  color: #f59e0b;
}

.metric-card.issue strong {
  color: #ef4444;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #52637a;
  color: #fff;
  font-size: 13px;
  flex: 0 0 auto;
}

.step-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.step-main strong,
.step-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-main small {
  color: #697891;
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

.openspec-task-row span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
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
  .requirement-hero-top {
    align-items: stretch;
    flex-direction: column;
  }

  .requirement-hero-actions {
    justify-content: flex-start;
  }

  .requirement-title {
    font-size: 18px;
  }

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

  .implementation-step-nav {
    grid-template-columns: 1fr;
  }

  .implementation-summary-strip {
    grid-template-columns: 1fr;
  }

  .summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
  }

  .metric-card {
    border-left: 0;
    border-top: 1px solid #e3e8f2;
  }
}
</style>
