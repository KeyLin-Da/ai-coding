<template>
  <el-dialog v-model="visible" title="提交审核结论" width="82%" :close-on-click-modal="false" destroy-on-close>
    <el-steps :active="activeStep" finish-status="success" class="review-steps">
      <el-step title="审核意见" />
      <el-step title="同步文件" />
      <el-step :title="confirmStepTitle" />
    </el-steps>

    <section v-if="activeStep === 0" class="review-step-panel">
      <el-form label-position="top">
        <el-alert v-if="implementationStepLabel" :title="implementationStepLabel" type="info" show-icon />
        <el-form-item label="结论">
          <el-radio-group v-model="decision">
            <el-radio-button value="APPROVED">通过</el-radio-button>
            <el-radio-button value="REJECTED">打回</el-radio-button>
            <el-radio-button value="RISK_ACCEPTED">带风险通过</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审核意见">
          <el-input v-model="comment" type="textarea" :rows="4" placeholder="记录审核依据、打回原因或风险说明" />
        </el-form-item>
      </el-form>
    </section>

    <section v-else-if="activeStep === 1" v-loading="loadingPlan" class="review-step-panel sync-panel">
      <el-alert v-if="syncPlan?.blocked" type="warning" show-icon :title="syncPlan.blockers.join('；')" class="sync-alert" />
      <div v-if="syncPlan" class="sync-meta">
        <span>仓库：{{ syncPlan.repoPath }}</span>
        <span>本地：{{ syncPlan.headCommit || '-' }}</span>
        <span>远端：{{ syncPlan.remoteCommit || '-' }}</span>
      </div>
      <ArtifactGitSyncPanel
        v-if="syncPlan"
        v-model:selected-files="selectedFiles"
        :plan="syncPlan"
        :diff-hint="syncDiffHint"
      />
    </section>

    <section v-else class="review-step-panel confirm-panel">
      <el-alert type="info" show-icon :title="confirmAlertTitle" />
      <el-descriptions :column="1" border>
        <el-descriptions-item label="阶段">{{ stageLabels[stage] }}</el-descriptions-item>
        <el-descriptions-item label="文件数">{{ selectedFiles.length }}</el-descriptions-item>
        <el-descriptions-item label="提交信息">{{ confirmCommitMessage }}</el-descriptions-item>
      </el-descriptions>
    </section>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button v-if="activeStep > 0" @click="activeStep -= 1">上一步</el-button>
      <el-button v-if="activeStep === 0" type="primary" :icon="Check" :loading="loadingPlan" @click="nextFromReview">
        {{ requiresGitSync ? '下一步' : '提交' }}
      </el-button>
      <el-button
        v-else-if="activeStep === 1"
        type="primary"
        :disabled="!canContinueToConfirm"
        @click="activeStep = 2"
      >
        下一步
      </el-button>
      <el-button v-else type="primary" :icon="Check" :loading="pushing" :disabled="!canConfirmReview" @click="confirmPush">
        {{ confirmButtonText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { ImplementationStep, ReviewDecision, WorkflowStage } from '@shared/workflow';
import { implementationStepLabels, stageLabels } from '@shared/workflow';
import { apiClient, type ArtifactGitSyncConfirmResult, type ArtifactGitSyncPlan } from '@/api/client';
import ArtifactGitSyncPanel from '@/components/ArtifactGitSyncPanel.vue';

const visible = ref(false);
const activeStep = ref(0);
const decision = ref<ReviewDecision>('APPROVED');
const comment = ref('');
const stage = ref<WorkflowStage>('PRD');
const implementationStep = ref<ImplementationStep | undefined>();
const artifactPath = ref<string | undefined>();
const implementationStepLabel = ref('');
const requirementId = ref('');
const requirementPk = ref<string | number | undefined>();
const syncPlan = ref<ArtifactGitSyncPlan | undefined>();
const selectedFiles = ref<string[]>([]);
const loadingPlan = ref(false);
const pushing = ref(false);

const emit = defineEmits<{
  (event: 'submit', value: { stage: WorkflowStage; implementationStep?: ImplementationStep; decision: ReviewDecision; comment: string; artifactPath?: string }): void;
  (event: 'synced', value: ArtifactGitSyncConfirmResult): void;
}>();

const requiresGitSync = computed(() => !implementationStep.value && (decision.value === 'APPROVED' || decision.value === 'RISK_ACCEPTED'));

const hasSyncFiles = computed(() => Boolean(syncPlan.value?.files.length));
const canContinueToConfirm = computed(() => Boolean(syncPlan.value && !syncPlan.value.blocked && (!hasSyncFiles.value || selectedFiles.value.length)));
const canConfirmReview = computed(() => Boolean(!pushing.value && syncPlan.value && !syncPlan.value.blocked && (!hasSyncFiles.value || selectedFiles.value.length)));
const commitMessage = computed(() => `ai-delivery(${requirementId.value}): sync ${stage.value}`);
const confirmCommitMessage = computed(() => (hasSyncFiles.value ? commitMessage.value : '无需提交'));
const syncDiffHint = computed(() => (
  hasSyncFiles.value
    ? '确认后会提交当前勾选文件，push 成功后再推进审核状态。'
    : '当前没有需要同步的文件，确认后将直接提交审核结论。'
));
const confirmStepTitle = computed(() => (syncPlan.value && !hasSyncFiles.value ? '确认审核' : '确认推送'));
const confirmAlertTitle = computed(() => (
  hasSyncFiles.value
    ? '确认推送后，中心才会写入 Git 版本索引并推进审核状态。'
    : '当前没有待同步文件，确认后将直接推进审核状态。'
));
const confirmButtonText = computed(() => (hasSyncFiles.value ? '确认推送并通过' : '确认提交审核'));

function open(nextStage: WorkflowStage, path?: string, nextImplementationStep?: ImplementationStep, nextRequirementId?: string, nextRequirementPk?: string | number) {
  stage.value = nextStage;
  implementationStep.value = nextImplementationStep;
  implementationStepLabel.value = nextImplementationStep ? `实施验证子步骤：${implementationStepLabels[nextImplementationStep]}` : '';
  artifactPath.value = path;
  requirementId.value = nextRequirementId || '';
  requirementPk.value = nextRequirementPk;
  decision.value = 'APPROVED';
  comment.value = '';
  activeStep.value = 0;
  syncPlan.value = undefined;
  selectedFiles.value = [];
  visible.value = true;
}

async function nextFromReview() {
  if (!requiresGitSync.value) {
    emitSubmit();
    return;
  }
  if (!requirementId.value) {
    ElMessage.warning('缺少需求编号，无法生成Git同步计划');
    return;
  }
  await loadSyncPlan();
  activeStep.value = 1;
}

async function loadSyncPlan() {
  loadingPlan.value = true;
  try {
    syncPlan.value = await apiClient.planArtifactGitSync(requirementId.value, {
      stage: stage.value,
      syncType: 'REVIEW_APPROVAL'
    });
    selectedFiles.value = syncPlan.value.files.filter((file) => file.selected).map((file) => file.path);
  } catch (error: any) {
    syncPlan.value = undefined;
    selectedFiles.value = [];
    ElMessage.error(error.message || '生成同步计划失败');
  } finally {
    loadingPlan.value = false;
  }
}

async function confirmPush() {
  if (!syncPlan.value) {
    ElMessage.warning('请先生成Git同步计划');
    return;
  }
  if (hasSyncFiles.value && !selectedFiles.value.length) {
    ElMessage.warning('请选择需要同步的文件');
    return;
  }
  pushing.value = true;
  try {
    const result = await apiClient.confirmArtifactGitSync(requirementId.value, {
      stage: stage.value,
      syncType: 'REVIEW_APPROVAL',
      requirementPk: requirementPk.value,
      files: selectedFiles.value,
      message: commitMessage.value,
      review: {
        decision: decision.value,
        comment: comment.value
      }
    });
    emit('synced', result);
    visible.value = false;
  } catch (error: any) {
    ElMessage.error(error.message || '同步推送失败');
  } finally {
    pushing.value = false;
  }
}

function emitSubmit() {
  emit('submit', {
    stage: stage.value,
    implementationStep: implementationStep.value,
    decision: decision.value,
    comment: comment.value,
    artifactPath: artifactPath.value
  });
  visible.value = false;
}

defineExpose({ open });
</script>

<style scoped>
.review-steps {
  margin-bottom: 1rem;
}

.review-step-panel {
  min-height: 360px;
}

.sync-alert {
  margin-bottom: 0.75rem;
}

.sync-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 0.75rem;
}

.confirm-panel {
  display: grid;
  align-content: start;
  gap: 1rem;
}
</style>
