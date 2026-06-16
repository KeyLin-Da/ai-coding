<template>
  <div v-if="workflow" v-loading="pageBusy" class="detail-page">
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
        <el-tag v-if="workflow.onlineClientCount !== undefined" size="small" type="success" effect="plain">在线 {{ workflow.onlineClientCount }}</el-tag>
        <el-tag v-if="workflow.pendingReviewCount !== undefined" size="small" type="warning" effect="plain">待审 {{ workflow.pendingReviewCount }}</el-tag>
        <el-tag v-if="workflow.jobStatus" size="small" type="info" effect="plain">{{ workflow.jobStatus }}</el-tag>
        <el-tag size="small" :type="realtimeStatusType" effect="plain">{{ realtimeStatusText }}</el-tag>
        <span class="branch-pill">{{ workflow.branchName || '未绑定分支' }}</span>
      </div>
      <el-alert
        v-if="workspaceBlockerText"
        type="warning"
        show-icon
        :title="workspaceBlockerText"
        class="workspace-state-alert"
      />
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
                maxlength="5000"
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
              <div class="action-line">
                <el-button type="primary" :icon="primaryActionIcon(Operation)" @click="runPrd">{{ actionButtonText('生成 PRD') }}</el-button>
                <el-button :disabled="!canClarifyPrd" :icon="ChatLineSquare" @click="openPrdClarificationDialog">澄清 PRD</el-button>
                <span v-if="requiresPrdApproval && !canClarifyPrd" class="muted">请先生成 PRD 文档后再澄清。</span>
              </div>
              <MarkdownEditor title="PRD 文档" :artifact-path="prdEditorPath" @saved="reload" />
            </div>

            <div v-else-if="activeStage === 'TECH_DESIGN'" class="stage-actions">
              <el-alert v-if="requiresPrdApproval && !prdApproved" type="warning" show-icon title="需要先通过 PRD 审核" />
              <el-descriptions v-if="requiresPrdApproval" :column="1" border class="design-source-summary">
                <el-descriptions-item label="PRD 文档">
                  <span class="design-source-path">{{ prdDesignSourcePath || '未关联' }}</span>
                </el-descriptions-item>
              </el-descriptions>
              <section class="design-input-panel" aria-label="技术方案生成输入">
                <div class="design-input-block">
                  <div class="design-input-heading">
                    <div>
                      <strong>补充材料</strong>
                      <p class="muted">支持 PDF、图片、Markdown；仅作为下一次技术方案生成的增量输入。</p>
                    </div>
                    <input
                      ref="techDesignFileInput"
                      class="hidden-file-input"
                      type="file"
                      multiple
                      accept=".pdf,.md,.markdown,image/*"
                      @change="uploadTechDesignFiles"
                    />
                    <el-button class="design-upload-button" :icon="Upload" @click="chooseTechDesignFiles">
                      上传补充材料
                    </el-button>
                  </div>
                  <div v-if="techDesignSourceFiles.length" class="prd-file-list design-file-list">
                    <div v-for="file in techDesignSourceFiles" :key="file.id" class="prd-file-item">
                      <div class="prd-file-meta">
                        <strong>{{ file.name }}</strong>
                        <small class="muted">{{ file.path }} · {{ formatFileSize(file.size) }}</small>
                      </div>
                      <el-button type="danger" link :icon="Delete" @click="deleteTechDesignFile(file.id)">删除</el-button>
                    </div>
                  </div>
                  <div v-if="pendingTechDesignQuestionContextPaths.length" class="design-question-context">
                    <span class="context-badge">新增答疑</span>
                    <span>{{ pendingTechDesignQuestionContextText }}</span>
                    <small>将纳入下一次生成</small>
                  </div>
                </div>
                <div class="design-input-block">
                  <div class="design-input-heading">
                    <div>
                      <strong>补充说明</strong>
                      <p class="muted">用于补充约束、评审意见或二次修改说明；成功生成后会清空。</p>
                    </div>
                  </div>
                  <el-input
                    v-model="designClarification"
                    class="design-clarification"
                    type="textarea"
                    :rows="4"
                    maxlength="5000"
                    show-word-limit
                    placeholder="补充评审意见、约束或二次修改说明（可选）"
                  />
                </div>
                <div class="design-run-footer">
                  <span class="muted">仅新增答疑、批注、补充材料和补充说明会纳入下一次生成，成功生成后自动清空当前增量输入。</span>
                  <div class="design-run-actions">
                    <el-button class="design-question-entry-button" :icon="ChatLineSquare" @click="openDesignQuestionDialog">
                      {{ techDesignQuestionButtonText }}
                    </el-button>
                    <el-button class="design-run-button" type="primary" :disabled="!canRunDesign" :icon="primaryActionIcon(Operation)" @click="runDesign">
                      {{ actionButtonText('生成技术方案') }}
                    </el-button>
                  </div>
                </div>
              </section>
              <MarkdownEditor title="技术方案" :artifact-path="technicalDesignEditorPath" @saved="reload" />
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

              <template v-if="activeImplementationStep === 'START_CHANGE'">
                <div class="action-line">
                  <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                  <el-button type="primary" :disabled="!canRunOpenSpecNewChange" :icon="primaryActionIcon(Operation)" @click="runOpenSpecNewChange">
                    {{ actionButtonText('开始变更') }}
                  </el-button>
                  <el-button :icon="primaryActionIcon(DataAnalysis)" @click="runOpenSpecStatus">{{ actionButtonText('查看 OpenSpec 状态') }}</el-button>
                  <el-button :icon="DocumentChecked" @click="openReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!techDesignApproved" type="warning" show-icon title="需要先通过技术方案审核" />
                <el-alert v-else-if="openSpecChangeExists" type="success" show-icon title="已检测到对应 OpenSpec 变更目录，无需重复开始变更" />
              </template>

              <template v-if="activeImplementationStep === 'ARTIFACT_REVIEW'">
                <div class="action-line">
                  <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                  <el-button type="primary" :disabled="!canRunOpenSpecArtifacts" :icon="primaryActionIcon(Operation)" @click="runOpenSpecArtifacts">
                    {{ actionButtonText('生成 OpenSpec 工件') }}
                  </el-button>
                  <el-button :icon="primaryActionIcon(DataAnalysis)" @click="runOpenSpecStatus">{{ actionButtonText('查看 OpenSpec 状态') }}</el-button>
                  <el-button :icon="DocumentChecked" @click="openReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="implementationStepStates.START_CHANGE.status !== 'APPROVED'" type="warning" show-icon title="请先完成并审核开始变更步骤" />
                <el-alert v-else-if="!techDesignApproved" type="warning" show-icon title="需要先通过技术方案审核" />
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
                <GitChangeInspector :summary="gitChanges" :requirement-id="workflow.requirementId" @updated="gitChanges = $event" />
              </template>

              <section class="openspec-section junit-report-section">
                <div class="section-title">
                  <strong>单元测试报告</strong>
                  <span class="muted">{{ junitArtifactPath || '未生成' }}</span>
                </div>
                <div v-if="junitArtifact" class="report-entry">
                  <span class="report-path">{{ junitArtifact.path }}</span>
                  <el-button :icon="View" @click="previewArtifact(junitArtifact)">查看报告</el-button>
                </div>
                <el-alert v-else type="warning" show-icon title="尚未扫描到单元测试报告，开始实施任务应产出 docs/{需求号}/junit/** 报告作为验证证据" />
              </section>

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
                <el-radio-group v-model="codeReviewMode" size="small">
                  <el-radio-button label="commit">正式评审</el-radio-button>
                  <el-radio-button label="staged">暂存区预审</el-radio-button>
                </el-radio-group>
                <el-button type="primary" :icon="primaryActionIcon(Operation)" @click="runCodeReview">{{ actionButtonText('生成代码评审') }}</el-button>
                <el-button type="danger" :icon="Back" @click="returnToImplementation">打回实施</el-button>
                <el-button v-if="canArchiveOpenSpec" type="success" :icon="primaryActionIcon(DocumentChecked)" @click="runOpenSpecArchive">
                  {{ actionButtonText('归档 OpenSpec') }}
                </el-button>
              </div>
              <el-alert v-if="codeReviewMode === 'staged'" type="warning" show-icon title="暂存区预审仅基于 git diff --cached，不作为正式合并判定" />
              <el-alert v-if="openSpecSummary?.archived" type="success" show-icon :title="`OpenSpec 已归档：${openSpecSummary.archivePath}`" />
              <MarkdownEditor title="代码评审汇总" :artifact-path="stageArtifactPath('CODE_REVIEW')" @saved="reload" />
            </div>
          </div>
        </section>
      </main>

      <ArtifactSidebar
        :workflow="workflow"
        :artifacts="workflow.artifacts"
        :issues="workflow.issues"
        @refresh="runRefresh"
        @select="previewArtifact"
        @public-sync="openPublicSync"
      />
    </div>

    <ReviewDialog ref="reviewDialog" @submit="submitReview" @synced="handleArtifactGitSynced" />
    <ArtifactGitSyncDialog ref="artifactGitSyncDialog" @synced="handleArtifactGitSynced" />
    <el-dialog v-model="prdClarificationDialogVisible" title="澄清 PRD" width="640px" destroy-on-close class="prd-clarification-dialog">
      <section class="prd-clarification-panel">
        <div class="prd-clarification-document">
          <strong>当前 PRD 文档</strong>
          <span>{{ prdClarificationDocumentPath || '未生成' }}</span>
        </div>
        <el-alert type="info" show-icon title="将基于现有 PRD 文档更新 analysis.md，并在文末追加澄清历史。" />
        <el-input
          v-model="prdClarificationDraft"
          class="prd-clarification-input"
          type="textarea"
          :rows="5"
          maxlength="5000"
          show-word-limit
          placeholder="输入本次澄清描述，例如范围边界、异常场景、排除项或已确认业务约束"
        />
      </section>
      <template #footer>
        <el-button @click="prdClarificationDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="ChatLineSquare" @click="submitPrdClarification">{{ actionButtonText('提交澄清') }}</el-button>
      </template>
    </el-dialog>
    <DesignQuestionDialog
      ref="designQuestionDialog"
      :loading="techDesignQuestionLoading"
      :items="techDesignQuestionItems"
      :submit-label="actionButtonText('提问')"
      @open="loadTechDesignQuestionRecords"
      @progress="openRunLog"
      @delete="deleteDesignQuestion"
      @submit="runDesignQuestion"
    />
    <RunLogDrawer ref="runLogDrawer" :events="store.runEvents" />
    <ArtifactPreviewDialog ref="artifactPreviewDialog" />
  </div>
  <el-empty v-else description="需求加载中" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Back, ChatLineSquare, CopyDocument, DataAnalysis, Delete, DocumentChecked, Operation, Refresh, Tickets, Upload, View } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
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
  findFirstPendingImplementationStep,
  implementationStepLabels,
  implementationSteps,
  requirementTypeLabels,
  stageLabels,
  statusLabels,
  workflowStagesForWorkflow
} from '@shared/workflow';
import StageTimeline from '@/components/StageTimeline.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import OpenSpecDocuments from '@/components/OpenSpecDocuments.vue';
import ReviewDialog from '@/components/ReviewDialog.vue';
import RunLogDrawer from '@/components/RunLogDrawer.vue';
import ArtifactSidebar from '@/components/ArtifactSidebar.vue';
import ArtifactPreviewDialog from '@/components/ArtifactPreviewDialog.vue';
import ArtifactGitSyncDialog from '@/components/ArtifactGitSyncDialog.vue';
import DesignQuestionDialog from '@/components/DesignQuestionDialog.vue';
import GitChangeInspector from '@/components/GitChangeInspector.vue';
import { useWorkflowStore } from '@/stores/workflow';
import { apiClient, type RequirementWorkspaceStateVO } from '@/api/client';
import { getApiRuntimeConfig } from '@/api/runtime';
import { findLatestStageRun } from '@/utils/run-selection';
import {
  buildTechDesignQuestionItems,
  parseTechDesignQuestionRecords,
  type TechDesignQuestionListItem,
  type TechDesignQuestionRecord
} from '@/utils/tech-design-questions';

const route = useRoute();
const store = useWorkflowStore();
const activeStage = ref<WorkflowStage>('PRD');
const reviewDialog = ref<InstanceType<typeof ReviewDialog>>();
const artifactGitSyncDialog = ref<InstanceType<typeof ArtifactGitSyncDialog>>();
const designQuestionDialog = ref<InstanceType<typeof DesignQuestionDialog>>();
const runLogDrawer = ref<InstanceType<typeof RunLogDrawer>>();
const artifactPreviewDialog = ref<InstanceType<typeof ArtifactPreviewDialog>>();
const prdFileInput = ref<HTMLInputElement>();
const techDesignFileInput = ref<HTMLInputElement>();
const selectedArtifactPath = ref('');
const sourceText = ref('');
const prdClarification = ref('');
const prdClarificationDialogVisible = ref(false);
const prdClarificationDraft = ref('');
const changeName = ref('');
const branchName = ref('');
const codeReviewMode = ref<'commit' | 'staged'>('commit');
const selectedAgentId = ref('codex');
const selectedExecutionMode = ref<ExecutionMode>('BACKGROUND');
const designClarification = ref('');
const techDesignQuestionLoading = ref(false);
const techDesignQuestionRecords = ref<TechDesignQuestionRecord[]>([]);
const openSpecSummary = ref<OpenSpecSummary>();
const selectedOpenSpecDocPath = ref('');
let openSpecSummaryRequestKey = '';
let openSpecSummaryInFlight: Promise<void> | undefined;
let workspaceStatesRequestKey = '';
let workspaceStatesInFlight: Promise<void> | undefined;
const openSpecPreviewVersion = ref(0);
const activeImplementationStep = ref<ImplementationStep>('START_CHANGE');
const gitChanges = ref<GitChangeSummary>();
const workspaceStates = ref<RequirementWorkspaceStateVO[]>([]);
const actionRunning = ref(false);

const workflow = computed(() => store.current);
const pageBusy = computed(() => store.loading || actionRunning.value);
const realtimeStatusText = computed(() => {
  const text: Record<typeof store.realtimeStatus, string> = {
    CONNECTING: '实时连接中',
    CONNECTED: '实时已连接',
    DISCONNECTED: '实时未连接',
    ERROR: '实时异常'
  };
  return text[store.realtimeStatus];
});
const realtimeStatusType = computed(() => {
  const type: Record<typeof store.realtimeStatus, 'success' | 'info' | 'warning' | 'danger'> = {
    CONNECTING: 'warning',
    CONNECTED: 'success',
    DISCONNECTED: 'info',
    ERROR: 'danger'
  };
  return type[store.realtimeStatus];
});
const applicableStages = computed(() => workflowStagesForWorkflow(workflow.value));
const isDefectWorkflow = computed(() => workflow.value?.requirementType === 'DEFECT');
const requiresPrdApproval = computed(() => !isDefectWorkflow.value);
const implementationStepStates = computed(() => ensureImplementationSteps(workflow.value?.implementationSteps));
const currentStageRun = computed<RunRecord | undefined>(() => {
  return findLatestStageRun(workflow.value?.runs || [], activeStage.value, activeStage.value === 'IMPLEMENTATION' ? activeImplementationStep.value : undefined);
});
const prdSourceFiles = computed(() => workflow.value?.prdSourceFiles || []);
const techDesignSourceFiles = computed(() => workflow.value?.techDesignSourceFiles || []);
const prdApproved = computed(() => workflow.value?.stages.PRD.status === 'APPROVED');
const techDesignApproved = computed(() => workflow.value?.stages.TECH_DESIGN.status === 'APPROVED');
const workspaceBlockers = computed(() => {
  const currentUserId = getApiRuntimeConfig().userId;
  return workspaceStates.value.filter((state) => {
    if (String(state.userId) === String(currentUserId)) {
      return false;
    }
    return ['EDITING', 'DIRTY', 'SYNCING'].includes(state.status);
  });
});
const workspaceBlockerText = computed(() => {
  if (!workspaceBlockers.value.length) {
    return '';
  }
  const names = [...new Set(workspaceBlockers.value.map((state) => state.userDisplayName || `用户 ${state.userId}`))].join('、');
  const total = workspaceBlockers.value.reduce((sum, state) => sum + (state.dirtyFileCount || 0), 0);
  return `${names} 正在编辑当前需求，本地未同步文件 ${total} 个。请等待对方公开同步或清理后再操作。`;
});
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
const openSpecChangeExists = computed(() => Boolean(openSpecSummary.value?.exists));
const canRunOpenSpecNewChange = computed(() => Boolean(techDesignApproved.value && !openSpecChangeExists.value));
const canRunOpenSpecArtifacts = computed(() => Boolean(implementationStepStates.value.START_CHANGE.status === 'APPROVED' && techDesignApproved.value));
const canRunOpenSpecApply = computed(() => implementationStepStates.value.ARTIFACT_REVIEW.status === 'APPROVED');
const canRunDesign = computed(() => (requiresPrdApproval.value ? Boolean(prdApproved.value && prdDesignSourcePath.value) : true));
const canInspectChanges = computed(() => implementationStepStates.value.APPLY.status === 'APPROVED');
const openIssueCount = computed(() => workflow.value?.issues.filter((item) => item.status === 'OPEN').length || 0);
const implementationOpenSpecPath = computed(() => openSpecSummary.value?.rootPath || stageArtifactPath('IMPLEMENTATION') || '未关联');
const implementationArchiveStatus = computed(() => (openSpecSummary.value?.archived ? '已归档' : '进行中'));
const requirementTypeText = computed(() => requirementTypeLabels[workflow.value?.requirementType || 'REQUIREMENT']);
const junitArtifact = computed(
  () =>
    workflow.value?.artifacts.find((artifact) => artifact.stage === 'IMPLEMENTATION' && artifact.exists && artifact.kind !== 'directory' && artifact.path.includes('/junit/'))
);
const junitArtifactPath = computed(() => junitArtifact.value?.path || '');
const prdEditorPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  if (!requiresPrdApproval.value) {
    return '';
  }
  const selected = workflow.value.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
  if (selected?.stage === 'PRD' && selected.kind !== 'directory') {
    return selected.path;
  }
  return stageArtifactPath('PRD') || workflow.value.stages.PRD.artifactPath || `docs/${workflow.value.requirementId}/prd/analysis.md`;
});
const prdClarificationDocumentPath = computed(() => {
  if (!workflow.value || !requiresPrdApproval.value) {
    return '';
  }
  return workflow.value.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path || '';
});
const canClarifyPrd = computed(() => Boolean(requiresPrdApproval.value && prdClarificationDocumentPath.value));
const prdDesignSourcePath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  if (!requiresPrdApproval.value) {
    return '';
  }
  return prdEditorPath.value;
});
const openSpecPrdDocumentPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  if (!requiresPrdApproval.value) {
    return '';
  }
  const selected = workflow.value.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
  if (selected?.stage === 'PRD' && selected.exists && selected.kind !== 'directory') {
    return selected.path;
  }
  return stageArtifactPath('PRD') || workflow.value.stages.PRD.artifactPath || '';
});
const technicalDesignEditorPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  const artifactPath = officialTechnicalDesignArtifactPath();
  return artifactPath || defaultTechnicalDesignDocumentPath(workflow.value.requirementId);
});
const openSpecTechnicalDesignDocumentPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  return officialTechnicalDesignArtifactPath();
});
const legacyTechDesignQuestionPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  return `docs/${workflow.value.requirementId}/technical-design/questions.md`;
});
const techDesignQuestionArtifacts = computed(() => {
  if (!workflow.value) {
    return [];
  }
  const requirementId = workflow.value.requirementId;
  const legacyPath = legacyTechDesignQuestionPath.value;
  const questionPrefix = `docs/${requirementId}/technical-design/questions/`;
  return workflow.value.artifacts
    .filter(
      (artifact) =>
        artifact.exists &&
        artifact.kind !== 'directory' &&
        (artifact.id === 'technical-design-questions' || artifact.path === legacyPath || artifact.path.replace(/\\/g, '/').startsWith(questionPrefix))
    )
    .sort((left, right) => left.path.localeCompare(right.path));
});
const techDesignQuestionReadPaths = computed(() => {
  if (!workflow.value) {
    return [];
  }
  const paths = new Set(techDesignQuestionArtifacts.value.map((artifact) => artifact.path));
  for (const run of workflow.value.runs || []) {
    if (run.actionType !== 'DESIGN_QUESTION') {
      continue;
    }
    const outputPath = normalizeTechDesignQuestionPath(run.params?.outputPath);
    if (isTechDesignQuestionPath(outputPath)) {
      paths.add(outputPath);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
});
const techDesignQuestionContextPaths = computed(() => {
  const paths = new Set(techDesignQuestionArtifacts.value.map((artifact) => artifact.path));
  for (const record of techDesignQuestionRecords.value) {
    const sourcePath = normalizeTechDesignQuestionPath(record.sourcePath);
    if (isTechDesignQuestionPath(sourcePath)) {
      paths.add(sourcePath);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
});
const consumedTechDesignQuestionPathSet = computed(() => {
  return new Set((workflow.value?.techDesignConsumedQuestionPaths || []).map((path) => normalizeTechDesignQuestionPath(path)).filter(Boolean));
});
const pendingTechDesignQuestionContextPaths = computed(() => {
  return techDesignQuestionContextPaths.value.filter((path) => !consumedTechDesignQuestionPathSet.value.has(normalizeTechDesignQuestionPath(path)));
});
const pendingTechDesignQuestionContextText = computed(() => {
  if (!pendingTechDesignQuestionContextPaths.value.length) {
    return '';
  }
  if (pendingTechDesignQuestionContextPaths.value.length === 1) {
    return pendingTechDesignQuestionContextPaths.value[0];
  }
  return `${pendingTechDesignQuestionContextPaths.value.length} 条新增答疑记录`;
});
const techDesignGenerationSourcePaths = computed(() => {
  const paths = [...pendingTechDesignQuestionContextPaths.value, ...techDesignSourceFiles.value.map((file) => file.path)].filter(
    (item): item is string => Boolean(item)
  );
  return [...new Set(paths)];
});
const techDesignQuestionItems = computed(() => buildTechDesignQuestionItems(techDesignQuestionRecords.value, workflow.value?.runs || []));
const techDesignQuestionButtonText = computed(() => (techDesignQuestionItems.value.length ? `技术方案答疑 ${techDesignQuestionItems.value.length}` : '技术方案答疑'));
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

function defaultTechnicalDesignDocumentPath(requirementId: string) {
  return `docs/${requirementId}/technical-design/design_review.md`;
}

function isTechnicalDesignSourcePath(filePath: string) {
  return filePath.replace(/\\/g, '/').includes('/technical-design/file/');
}

function normalizeTechDesignQuestionPath(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
}

function isTechDesignQuestionPath(filePath: string) {
  if (!workflow.value || !filePath) {
    return false;
  }
  const requirementId = workflow.value.requirementId;
  const legacyPath = `docs/${requirementId}/technical-design/questions.md`;
  const questionPrefix = `docs/${requirementId}/technical-design/questions/`;
  return filePath === legacyPath || (filePath.startsWith(questionPrefix) && /\.md$/i.test(filePath));
}

function officialTechnicalDesignArtifactPath() {
  if (!workflow.value) {
    return '';
  }
  const defaultPath = defaultTechnicalDesignDocumentPath(workflow.value.requirementId);
  const officialArtifact = workflow.value.artifacts.find(
    (artifact) => artifact.exists && artifact.kind !== 'directory' && (artifact.id === 'technical-design' || artifact.path === defaultPath)
  );
  if (officialArtifact) {
    return officialArtifact.path;
  }
  const artifactPath = workflow.value.stages.TECH_DESIGN.artifactPath?.trim();
  if (artifactPath && !isTechnicalDesignSourcePath(artifactPath)) {
    return artifactPath;
  }
  return '';
}

async function reload(options: { preferCurrent?: boolean } = {}) {
  if (typeof route.params.requirementId === 'string') {
    const requirementId = route.params.requirementId;
    const alreadyLoaded = workflow.value?.requirementId === requirementId;
    if (!options.preferCurrent || !alreadyLoaded) {
      await store.loadRequirement(requirementId);
    }
    store.streamWorkflowEvents();
  }
}

async function loadWorkspaceStates() {
  if (!workflow.value?.id) {
    workspaceStates.value = [];
    return;
  }
  const workflowId = workflow.value.id;
  const key = String(workflowId);
  if (workspaceStatesInFlight && workspaceStatesRequestKey === key) {
    await workspaceStatesInFlight;
    return;
  }
  workspaceStatesRequestKey = key;
  workspaceStatesInFlight = (async () => {
    try {
      workspaceStates.value = await apiClient.listRequirementWorkspaceStates(workflowId);
    } catch {
      workspaceStates.value = [];
    } finally {
      if (workspaceStatesRequestKey === key) {
        workspaceStatesInFlight = undefined;
      }
    }
  })();
  await workspaceStatesInFlight;
}

async function loadOpenSpecSummary() {
  if (!workflow.value) {
    return;
  }
  const requirementId = workflow.value.requirementId;
  const currentChangeName = changeName.value || `req-${requirementId}`;
  const key = `${requirementId}:${currentChangeName}`;
  if (openSpecSummaryInFlight && openSpecSummaryRequestKey === key) {
    await openSpecSummaryInFlight;
    return;
  }
  openSpecSummaryRequestKey = key;
  openSpecSummaryInFlight = (async () => {
    const summary = await apiClient.getOpenSpecSummary(requirementId, currentChangeName);
    openSpecSummary.value = summary;
    const selectedStillExists = openSpecDocuments.value.some((doc) => doc.path === selectedOpenSpecDocPath.value && doc.exists);
    if (!selectedStillExists) {
      selectedOpenSpecDocPath.value = openSpecDocuments.value.find((doc) => doc.exists)?.path || '';
    }
  })().finally(() => {
    if (openSpecSummaryRequestKey === key) {
      openSpecSummaryInFlight = undefined;
    }
  });
  await openSpecSummaryInFlight;
}

function previewArtifact(artifact: ArtifactRef) {
  artifactPreviewDialog.value?.open(artifact);
}

async function loadTechDesignQuestionRecords() {
  const paths = techDesignQuestionReadPaths.value;
  if (!paths.length) {
    techDesignQuestionRecords.value = [];
    return;
  }
  techDesignQuestionLoading.value = true;
  try {
    const records: TechDesignQuestionRecord[] = [];
    for (const path of paths) {
      try {
        const result = await apiClient.readArtifact(path);
        records.push(...parseTechDesignQuestionRecords(result.content, path));
      } catch (error) {
        console.warn('读取技术方案答疑记录失败:', path, error);
      }
    }
    techDesignQuestionRecords.value = records;
  } catch (error) {
    console.error('读取技术方案答疑记录失败:', error);
    techDesignQuestionRecords.value = [];
  } finally {
    techDesignQuestionLoading.value = false;
  }
}

function openDesignQuestionDialog() {
  designQuestionDialog.value?.open();
}

async function runRefresh() {
  actionRunning.value = true;
  try {
    const result = await store.runAction({ actionType: 'REFRESH_ARTIFACTS' });
    if (result?.run?.id) {
      await openRunLog(result.run.id);
    }
    await loadOpenSpecSummary();
    ElMessage.success('产物索引已刷新');
  } finally {
    actionRunning.value = false;
  }
}

async function runPrd() {
  if (!requiresPrdApproval.value) {
    ElMessage.warning('缺陷类型不需要 PRD 分析');
    return;
  }
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

function openPrdClarificationDialog() {
  if (!requiresPrdApproval.value) {
    ElMessage.warning('缺陷类型不需要 PRD 澄清');
    return;
  }
  if (!canClarifyPrd.value) {
    ElMessage.warning('请先生成 PRD 文档');
    return;
  }
  prdClarificationDraft.value = '';
  prdClarificationDialogVisible.value = true;
}

async function submitPrdClarification() {
  if (!workflow.value) {
    return;
  }
  const description = prdClarificationDraft.value.trim();
  if (!description) {
    ElMessage.warning('请输入 PRD 澄清描述');
    return;
  }
  if (!canClarifyPrd.value) {
    ElMessage.warning('请先生成 PRD 文档');
    return;
  }
  if (workflow.value.stages.PRD.status === 'APPROVED') {
    try {
      await ElMessageBox.confirm('澄清会更新 PRD 文档，并将 PRD 回到待审核状态；下游产物会保留供你判断是否复用。是否继续？', '确认澄清 PRD', {
        type: 'warning'
      });
    } catch {
      return;
    }
  }
  await runOrCopyAction({
    actionType: 'PRD_CLARIFY',
    params: {
      ...agentActionParams(),
      description
    }
  }, async () => {
    prdClarificationDialogVisible.value = false;
    prdClarificationDraft.value = '';
    await reload();
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
  if (!(await ensureDeliveryReady('上传 PRD 来源文件', { allowDirty: true, skipRepositoryChecks: true }))) {
    input.value = '';
    return;
  }
  actionRunning.value = true;
  try {
    await store.uploadPrdFiles(files);
    ElMessage.success('PRD 来源文件已上传');
  } catch (error: any) {
    ElMessage.error(error.message || 'PRD 来源文件上传失败');
  } finally {
    actionRunning.value = false;
    input.value = '';
  }
}

async function deletePrdFile(fileId: string) {
  if (!(await ensureDeliveryReady('删除 PRD 来源文件', { allowDirty: true, skipRepositoryChecks: true }))) {
    return;
  }
  actionRunning.value = true;
  try {
    await store.deletePrdFile(fileId);
    ElMessage.success('PRD 来源文件已删除');
  } catch (error: any) {
    ElMessage.error(error.message || 'PRD 来源文件删除失败');
  } finally {
    actionRunning.value = false;
  }
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
  if (!(await ensureDeliveryReady('上传技术方案补充材料', { allowDirty: true, skipRepositoryChecks: true }))) {
    input.value = '';
    return;
  }
  actionRunning.value = true;
  try {
    await store.uploadTechDesignFiles(files);
    ElMessage.success('技术方案补充材料已上传');
  } catch (error: any) {
    ElMessage.error(error.message || '技术方案补充材料上传失败');
  } finally {
    actionRunning.value = false;
    input.value = '';
  }
}

async function deleteTechDesignFile(fileId: string) {
  if (!(await ensureDeliveryReady('删除技术方案补充材料', { allowDirty: true, skipRepositoryChecks: true }))) {
    return;
  }
  actionRunning.value = true;
  try {
    await store.deleteTechDesignFile(fileId);
    ElMessage.success('技术方案补充材料已删除');
  } catch (error: any) {
    ElMessage.error(error.message || '技术方案补充材料删除失败');
  } finally {
    actionRunning.value = false;
  }
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

async function ensureDeliveryReady(actionLabel: string, options: { allowDirty?: boolean; skipRepositoryChecks?: boolean } = {}) {
  const runtime = getApiRuntimeConfig();
  if (!runtime.clientSessionId) {
    ElMessage.warning('请先在个人中心配置客户端会话ID');
    return false;
  }
  try {
    const workspace = await apiClient.getDeliveryWorkspace(runtime.clientSessionId);
    if (!workspace?.localPath) {
      ElMessage.warning(`请先在个人中心配置交付工作区，再${actionLabel}`);
      return false;
    }
    if (!options.skipRepositoryChecks) {
      const credentials = await apiClient.listGitCredentials();
      if (!credentials.some((credential) => credential.status === 'ACTIVE')) {
        ElMessage.warning(`请先在个人中心生成Git SSH凭证，再${actionLabel}`);
        return false;
      }
    }
    if (!options.skipRepositoryChecks && runtime.projectId) {
      const repoState = await apiClient.refreshProjectRepositoryStatus(runtime.projectId);
      if (repoState.syncStatus === 'NOT_CLONED') {
        ElMessage.warning('项目产物仓尚未 clone，请先在个人中心完成项目仓初始化');
        return false;
      }
      if (repoState.syncStatus === 'BEHIND_REMOTE') {
        ElMessage.warning('本地项目产物仓落后远端，请先拉取最新提交');
        return false;
      }
      if (repoState.syncStatus === 'CONFLICTING' || repoState.syncStatus === 'FAILED' || repoState.syncStatus === 'PUSHING') {
        ElMessage.warning('项目产物仓状态异常，请先在个人中心处理后再继续');
        return false;
      }
      if (repoState.syncStatus === 'DIRTY' && options.allowDirty === false) {
        ElMessage.warning('项目产物仓存在未同步变更，请先公开同步或清理后再继续流程动作');
        return false;
      }
    }
    if (workflow.value?.id) {
      await apiClient.assertRequirementWritable(workflow.value.id, runtime.clientSessionId);
      await loadWorkspaceStates();
    }
    return true;
  } catch (error: any) {
    if (Array.isArray(error.data)) {
      workspaceStates.value = error.data;
    }
    ElMessage.error(error.message || `无法确认交付工作区状态，已阻断${actionLabel}`);
    return false;
  }
}

async function runOrCopyAction(action: ActionInput, afterRun?: () => Promise<void>) {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('执行流程动作'))) {
    return;
  }
  actionRunning.value = true;
  try {
    if (manualCopyMode.value) {
      const { commandText } = await apiClient.previewActionCommand(workflow.value.requirementId, action);
      await copyToClipboard(commandText);
      ElMessage.success('命令已复制');
      return;
    }
    const result = await store.runAction(action);
    if (result?.run?.id) {
      await openRunLog(result.run.id);
    }
    await afterRun?.();
  } catch (error: any) {
    ElMessage.error(error.message || '流程动作执行失败');
  } finally {
    actionRunning.value = false;
  }
}

async function runDesign() {
  const documentPath = prdDesignSourcePath.value.trim();
  if (requiresPrdApproval.value && !prdApproved.value) {
    ElMessage.warning('请先通过 PRD 审核');
    return;
  }
  if (requiresPrdApproval.value && !documentPath) {
    ElMessage.warning('未找到 PRD 文档，请先刷新产物');
    return;
  }
  const params: Record<string, unknown> = {
    ...agentActionParams(),
    sourceFiles: techDesignGenerationSourcePaths.value,
    clarification: designClarification.value.trim()
  };
  if (requiresPrdApproval.value) {
    params.documentPath = documentPath;
  }
  await runOrCopyAction({
    actionType: 'DESIGN_GENERATE',
    params
  });
}

async function runDesignQuestion(rawQuestion: string) {
  if (!workflow.value) {
    return;
  }
  const question = rawQuestion.trim();
  if (!question) {
    ElMessage.warning('请输入技术方案问题');
    return;
  }
  const designDocumentPath = openSpecTechnicalDesignDocumentPath.value.trim();
  if (!designDocumentPath) {
    ElMessage.warning('请先生成、保存或刷新技术方案产物');
    return;
  }
  const params: Record<string, unknown> = {
    ...agentActionParams(),
    question,
    designDocumentPath
  };
  if (requiresPrdApproval.value) {
    const prdDocumentPath = openSpecPrdDocumentPath.value.trim();
    if (!prdDocumentPath) {
      ElMessage.warning('请先生成、保存或刷新 PRD 产物');
      return;
    }
    params.prdDocumentPath = prdDocumentPath;
  }
  await runOrCopyAction({
    actionType: 'DESIGN_QUESTION',
    params
  }, async () => {
    await reload();
    await loadTechDesignQuestionRecords();
    designQuestionDialog.value?.clearQuestion();
  });
}

async function deleteDesignQuestion(item: TechDesignQuestionListItem) {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('删除技术方案答疑', { allowDirty: true }))) {
    return;
  }
  try {
    await ElMessageBox.confirm(`确认删除问题“${item.summary || item.question}”？`, '删除技术方案答疑', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  await store.deleteTechDesignQuestion({
    id: item.id,
    recordId: item.recordId,
    runId: item.runId,
    sourcePath: item.sourcePath,
    question: item.question
  });
  await reload();
  await loadTechDesignQuestionRecords();
  ElMessage.success('技术方案答疑问题已删除');
}

async function runOpenSpecStatus() {
  await runOrCopyAction({ actionType: 'OPENSPEC_STATUS', params: { changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runOpenSpecNewChange() {
  if (!techDesignApproved.value) {
    ElMessage.warning('请先通过技术方案审核');
    return;
  }
  if (openSpecChangeExists.value) {
    ElMessage.warning('已检测到对应 OpenSpec 变更目录，无需重复开始变更');
    return;
  }
  await runOrCopyAction({ actionType: 'OPENSPEC_NEW_CHANGE', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runOpenSpecArtifacts() {
  if (implementationStepStates.value.START_CHANGE.status !== 'APPROVED') {
    ElMessage.warning('请先完成并审核开始变更步骤');
    return;
  }
  if (!techDesignApproved.value) {
    ElMessage.warning('请先通过技术方案审核');
    return;
  }
  const prdDocumentPath = openSpecPrdDocumentPath.value.trim();
  const documentPath = openSpecTechnicalDesignDocumentPath.value.trim();
  if (requiresPrdApproval.value && !prdDocumentPath) {
    ElMessage.warning('请先生成、保存或刷新 PRD 产物');
    return;
  }
  if (!documentPath) {
    ElMessage.warning('请先生成、保存或刷新技术方案产物');
    return;
  }
  const params: Record<string, unknown> = {
    ...agentActionParams(),
    changeName: changeName.value,
    documentPath,
    sourceFiles: techDesignSourceFiles.value.map((file) => file.path)
  };
  if (requiresPrdApproval.value) {
    params.prdDocumentPath = prdDocumentPath;
  }
  await runOrCopyAction({ actionType: 'OPENSPEC_FF', params }, loadOpenSpecSummary);
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

function hasStagedTrackedChanges(summary: GitChangeSummary) {
  return summary.projects.some((project) => project.files.some((file) => file.staged));
}

async function ensureStagedChangesForReview() {
  if (!workflow.value || codeReviewMode.value !== 'staged') {
    return true;
  }
  try {
    const summary = await apiClient.getGitChanges(workflow.value.requirementId);
    gitChanges.value = summary;
    if (hasStagedTrackedChanges(summary)) {
      return true;
    }
    ElMessage.warning('暂存区没有已暂存文件，请先 git add 后再执行暂存区预审');
    return false;
  } catch (error: any) {
    ElMessage.error(error.message || '读取暂存区变更失败');
    return false;
  }
}

async function runCodeReview() {
  if (!(await ensureStagedChangesForReview())) {
    return;
  }
  await runOrCopyAction({ actionType: 'CODE_REVIEW', params: { ...agentActionParams(), branchName: branchName.value, reviewMode: codeReviewMode.value } });
}

async function runOpenSpecArchive() {
  await runOrCopyAction({ actionType: 'OPENSPEC_ARCHIVE', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function returnToImplementation() {
  if (!(await ensureDeliveryReady('打回实施', { allowDirty: true }))) {
    return;
  }
  const result = await store.runAction({ actionType: 'RETURN_TO_IMPLEMENTATION' });
  if (result?.run?.id) {
    await openRunLog(result.run.id);
  }
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
  if (activeImplementationStep.value === 'ARTIFACT_REVIEW' || activeImplementationStep.value === 'APPLY') {
    return selectedOpenSpecDocPath.value || stageArtifactPath('IMPLEMENTATION');
  }
  if (activeImplementationStep.value === 'CHANGE_INSPECTION') {
    return junitArtifactPath.value || undefined;
  }
  return undefined;
}

async function openReview() {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('提交审核', { allowDirty: true }))) {
    return;
  }
  const path =
    activeStage.value === 'PRD'
      ? prdEditorPath.value
      : activeStage.value === 'IMPLEMENTATION'
        ? implementationReviewArtifactPath()
        : stageArtifactPath(activeStage.value);
  reviewDialog.value?.open(
    activeStage.value,
    path,
    activeStage.value === 'IMPLEMENTATION' ? activeImplementationStep.value : undefined,
    workflow.value.requirementId,
    workflow.value.id
  );
}

async function openPublicSync() {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('公开同步', { allowDirty: true }))) {
    return;
  }
  artifactGitSyncDialog.value?.open(workflow.value.requirementId, workflow.value.id, activeStage.value);
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

async function handleArtifactGitSynced(result: { commitSha?: string; pushed?: boolean }) {
  const successMessage = result.pushed === false
    ? '审核记录已保存'
    : result.commitSha
      ? `产物已推送：${result.commitSha}`
      : '产物已推送';
  ElMessage.success(successMessage);
  await reload();
  if (workflow.value) {
    await store.loadRequirements();
  }
}

async function openRunLog(runId: string) {
  await store.loadRunEvents(runId);
  store.streamRunEvents(runId);
  if (typeof runLogDrawer.value?.open === 'function') {
    runLogDrawer.value.open();
  }
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
    branchName.value = value.branchName || '';
    designClarification.value = value.techDesignClarification || '';
    void loadOpenSpecSummary();
    const stages = applicableStages.value;
    const nextActiveStage = value.currentStage === 'DONE' ? stages[stages.length - 1] : value.currentStage;
    activeStage.value = stages.includes(nextActiveStage as WorkflowStage) ? (nextActiveStage as WorkflowStage) : stages[0] || 'PRD';

    if (activeStage.value === 'IMPLEMENTATION') {
      activeImplementationStep.value = findFirstPendingImplementationStep(value.implementationSteps);
    }
    void loadWorkspaceStates();
  },
  { immediate: true }
);

watch(activeImplementationStep, (step) => {
  if (step === 'CHANGE_INSPECTION') {
    void loadGitChanges();
  }
});

watch(
  () => techDesignQuestionReadPaths.value.join('|'),
  () => {
    void loadTechDesignQuestionRecords();
  },
  { immediate: true }
);

onMounted(async () => {
  await store.loadAgents();
  await reload({ preferCurrent: true });
});

onUnmounted(() => {
  store.stopRunStream();
  store.stopWorkflowStream();
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

.workspace-state-alert {
  margin: 10px 16px 0;
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

.design-input-panel {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%);
}

.design-input-block {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.design-input-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.design-input-heading > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.design-input-heading strong {
  color: #172033;
  font-size: 14px;
  line-height: 22px;
}

.design-input-heading p {
  margin: 0;
  line-height: 20px;
}

.design-upload-button {
  flex: 0 0 auto;
}

.design-file-list {
  background: #fff;
}

.design-question-context {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #334155;
  font-size: 13px;
}

.design-question-context span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.design-question-context small {
  color: #2563eb;
  white-space: nowrap;
}

.context-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
}

.design-clarification :deep(.el-textarea__inner) {
  min-height: 96px !important;
  border-radius: 8px;
  line-height: 1.6;
}

.design-run-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
}

.design-run-footer .muted {
  line-height: 20px;
}

.design-run-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
}

.design-question-entry-button {
  min-width: 116px;
}

.design-run-button {
  min-width: 132px;
}

.implementation-step-nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
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

.report-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #eef2f7;
  border-radius: 6px;
  background: #f8fafc;
}

.report-path {
  min-width: 0;
  color: #52637a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.prd-clarification-panel {
  display: grid;
  gap: 14px;
}

.prd-clarification-document {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #f8fbff;
}

.prd-clarification-document span {
  color: #64748b;
  overflow-wrap: anywhere;
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

  .design-input-heading,
  .design-run-footer,
  .design-run-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .design-upload-button,
  .design-question-entry-button,
  .design-run-button {
    width: 100%;
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

  .report-entry {
    align-items: stretch;
    flex-direction: column;
  }

  .report-path {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
