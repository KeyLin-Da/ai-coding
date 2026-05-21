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
            <div>
              <el-button :icon="DocumentChecked" @click="openReview">审核</el-button>
              <el-button v-if="latestRun" :icon="Tickets" @click="openRunLog(latestRun.id)">日志</el-button>
            </div>
          </div>

          <div class="stage-content">
            <div v-if="activeStage === 'PRD'" class="stage-actions">
              <el-input v-model="sourceText" type="textarea" :rows="3" placeholder="填写 PRD 来源，每行一个" />
              <el-button type="primary" :icon="Operation" @click="runPrd">生成 PRD</el-button>
              <MarkdownEditor title="PRD 文档" :artifact-path="stageArtifactPath('PRD')" @saved="reload" />
            </div>

            <div v-else-if="activeStage === 'TECH_DESIGN'" class="stage-actions">
              <el-alert v-if="!prdApproved" type="warning" show-icon title="需要先通过 PRD 审核" />
              <el-button type="primary" :disabled="!prdApproved" :icon="Operation" @click="runDesign">生成技术方案</el-button>
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
                <el-descriptions-item label="OpenSpec">{{ stageArtifactPath('IMPLEMENTATION') || '未关联' }}</el-descriptions-item>
                <el-descriptions-item label="待处理问题">{{ workflow.issues.filter((item) => item.status === 'OPEN').length }}</el-descriptions-item>
              </el-descriptions>
            </div>

            <div v-else class="stage-actions">
              <div class="action-line">
                <el-input v-model="branchName" placeholder="分支名，例如 feature/opp-172014" />
                <el-button type="primary" :icon="Operation" @click="runCodeReview">生成代码评审</el-button>
                <el-button type="danger" :icon="Back" @click="returnToImplementation">打回实施</el-button>
              </div>
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
import { Back, Cpu, DataAnalysis, DocumentChecked, Operation, Refresh, Tickets } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { RunRecord, WorkflowStage } from '@shared/workflow';
import { stageLabels } from '@shared/workflow';
import StageTimeline from '@/components/StageTimeline.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import ReviewDialog from '@/components/ReviewDialog.vue';
import RunLogDrawer from '@/components/RunLogDrawer.vue';
import ArtifactSidebar from '@/components/ArtifactSidebar.vue';
import { useWorkflowStore } from '@/stores/workflow';

const route = useRoute();
const store = useWorkflowStore();
const activeStage = ref<WorkflowStage>('PRD');
const reviewDialog = ref<InstanceType<typeof ReviewDialog>>();
const runLogDrawer = ref<InstanceType<typeof RunLogDrawer>>();
const selectedArtifactPath = ref('');
const sourceText = ref('');
const changeName = ref('');
const moduleName = ref('');
const branchName = ref('');

const workflow = computed(() => store.current);
const latestRun = computed<RunRecord | undefined>(() => workflow.value?.runs[0]);
const prdApproved = computed(() => workflow.value?.stages.PRD.status === 'APPROVED');
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
  ElMessage.success('产物索引已刷新');
}

async function runPrd() {
  await store.runAction({
    actionType: 'PRD_ANALYZE',
    params: { sources: sourceText.value.split('\n').map((item) => item.trim()).filter(Boolean) }
  });
}

async function runDesign() {
  await store.runAction({ actionType: 'DESIGN_GENERATE', params: { documentPath: stageArtifactPath('PRD') } });
}

async function runOpenSpecStatus() {
  await store.runAction({ actionType: 'OPENSPEC_STATUS', params: { changeName: changeName.value } });
}

async function runOpenSpecVerify() {
  await store.runAction({ actionType: 'OPENSPEC_VERIFY', params: { changeName: changeName.value } });
}

async function runJunit() {
  await store.runAction({ actionType: 'JUNIT_GENERATE', params: { moduleName: moduleName.value } });
}

async function runCodeReview() {
  await store.runAction({ actionType: 'CODE_REVIEW', params: { branchName: branchName.value } });
}

async function returnToImplementation() {
  await store.runAction({ actionType: 'RETURN_TO_IMPLEMENTATION' });
  activeStage.value = 'IMPLEMENTATION';
}

function openReview() {
  reviewDialog.value?.open(activeStage.value, stageArtifactPath(activeStage.value));
}

async function submitReview(input: { stage: WorkflowStage; decision: 'APPROVED' | 'REJECTED' | 'RISK_ACCEPTED'; comment: string; artifactPath?: string }) {
  await store.submitReview(input);
  ElMessage.success('审核记录已保存');
}

async function openRunLog(runId: string) {
  await store.loadRunEvents(runId);
  runLogDrawer.value?.open();
}

watch(
  workflow,
  (value) => {
    if (!value) {
      return;
    }
    sourceText.value = value.sources.join('\n');
    changeName.value = value.stages.IMPLEMENTATION.changeName || `req-${value.requirementId}`;
    moduleName.value = moduleName.value || '';
    branchName.value = value.branchName || '';
    if (value.currentStage !== 'DONE') {
      activeStage.value = value.currentStage;
    }
  },
  { immediate: true }
);

onMounted(async () => {
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

@media (max-width: 760px) {
  .action-line {
    align-items: stretch;
    flex-direction: column;
  }

  .action-line .el-input {
    max-width: none;
  }
}
</style>
