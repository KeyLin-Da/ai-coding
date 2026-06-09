<template>
  <el-dialog v-model="visible" title="公开同步产物" width="82%" :close-on-click-modal="false" destroy-on-close>
    <section v-loading="loadingPlan" class="sync-dialog-body">
      <el-alert v-if="syncPlan?.blocked" type="warning" show-icon :title="syncPlan.blockers.join('；')" class="sync-alert" />
      <div v-if="syncPlan" class="sync-meta">
        <span>阶段：{{ stageLabels[stage] }}</span>
        <span>仓库：{{ syncPlan.repoPath }}</span>
        <span>本地：{{ syncPlan.headCommit || '-' }}</span>
        <span>远端：{{ syncPlan.remoteCommit || '-' }}</span>
      </div>

      <ArtifactGitSyncPanel
        v-if="syncPlan"
        v-model:selected-files="selectedFiles"
        :plan="syncPlan"
        diff-hint="确认后会 git add 当前勾选的受控产物文件，并只提交这些文件。"
      />
    </section>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button :icon="Refresh" :loading="loadingPlan" @click="loadPlan">刷新计划</el-button>
      <el-button type="primary" :loading="pushing" :disabled="!canPush" @click="confirmPush">确认公开同步</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { WorkflowStage } from '@shared/workflow';
import { stageLabels } from '@shared/workflow';
import { apiClient, type ArtifactGitSyncConfirmResult, type ArtifactGitSyncPlan } from '@/api/client';
import ArtifactGitSyncPanel from '@/components/ArtifactGitSyncPanel.vue';

const visible = ref(false);
const requirementId = ref('');
const requirementPk = ref<string | number | undefined>();
const stage = ref<WorkflowStage>('PRD');
const syncPlan = ref<ArtifactGitSyncPlan | undefined>();
const selectedFiles = ref<string[]>([]);
const loadingPlan = ref(false);
const pushing = ref(false);

const emit = defineEmits<{
  (event: 'synced', value: ArtifactGitSyncConfirmResult): void;
}>();

const canPush = computed(() => Boolean(syncPlan.value && !syncPlan.value.blocked && selectedFiles.value.length && !pushing.value));
const commitMessage = computed(() => `ai-delivery(${requirementId.value}): public sync ${stage.value}`);

async function open(nextRequirementId: string, nextRequirementPk: string | number | undefined, nextStage: WorkflowStage) {
  requirementId.value = nextRequirementId;
  requirementPk.value = nextRequirementPk;
  stage.value = nextStage;
  syncPlan.value = undefined;
  selectedFiles.value = [];
  visible.value = true;
  await loadPlan();
}

async function loadPlan() {
  if (!requirementId.value) {
    return;
  }
  loadingPlan.value = true;
  try {
    syncPlan.value = await apiClient.planArtifactGitSync(requirementId.value, {
      stage: stage.value,
      syncType: 'PUBLIC_SYNC'
    });
    selectedFiles.value = syncPlan.value.files.filter((file) => file.selected).map((file) => file.path);
  } catch (error: any) {
    syncPlan.value = undefined;
    selectedFiles.value = [];
    ElMessage.error(error.message || '生成公开同步计划失败');
  } finally {
    loadingPlan.value = false;
  }
}

async function confirmPush() {
  if (!selectedFiles.value.length) {
    ElMessage.warning('请选择需要同步的文件');
    return;
  }
  pushing.value = true;
  try {
    const result = await apiClient.confirmArtifactGitSync(requirementId.value, {
      stage: stage.value,
      syncType: 'PUBLIC_SYNC',
      requirementPk: requirementPk.value,
      files: selectedFiles.value,
      message: commitMessage.value
    });
    emit('synced', result);
    visible.value = false;
  } catch (error: any) {
    ElMessage.error(error.message || '公开同步失败');
  } finally {
    pushing.value = false;
  }
}

defineExpose({ open });
</script>

<style scoped>
.sync-dialog-body {
  min-height: 540px;
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

</style>
