<template>
  <el-dialog v-model="visible" title="Token 使用明细" width="80%" top="6vh" destroy-on-close>
    <div v-loading="loading" class="token-detail-content">
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />
      <el-table :data="pageData.items" height="520" empty-text="暂无 Token 使用明细">
        <el-table-column label="时间" min-width="170">
          <template #default="{ row }">{{ formatOccurredAt(row.occurredAt) }}</template>
        </el-table-column>
        <el-table-column label="阶段 / 步骤" min-width="170">
          <template #default="{ row }">
            <div class="stage-cell">
              <span>{{ formatStage(row.stage) }}</span>
              <small>{{ formatStep(row.implementationStep) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="runId" label="Run ID" min-width="100" />
        <el-table-column prop="agentId" label="Agent" min-width="90" />
        <el-table-column prop="model" label="模型" min-width="110" />
        <el-table-column label="输入" width="100" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.inputTokens) }}</template>
        </el-table-column>
        <el-table-column label="缓存输入" width="110" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.cachedInputTokens) }}</template>
        </el-table-column>
        <el-table-column label="输出" width="90" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.outputTokens) }}</template>
        </el-table-column>
        <el-table-column label="推理输出" width="110" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.reasoningOutputTokens) }}</template>
        </el-table-column>
        <el-table-column label="总计" width="100" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.totalTokens) }}</template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="pageData.total"
        layout="total, sizes, prev, pager, next, jumper"
        class="token-detail-pagination"
        @current-change="loadDetails"
        @size-change="handlePageSizeChange"
      />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { RequirementTokenUsagePage, WorkflowImplementationStep, WorkflowStage } from '@shared/workflow';
import { implementationStepLabels, stageLabels } from '@shared/workflow';
import { apiClient } from '@/api/client';

const props = defineProps<{
  requirementPk?: string | number;
}>();

const visible = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const currentPage = ref(1);
const pageSize = ref(20);
const pageData = ref<RequirementTokenUsagePage>(emptyPage());

function emptyPage(): RequirementTokenUsagePage {
  return {
    requirementPk: props.requirementPk || '',
    page: currentPage.value,
    pageSize: pageSize.value,
    total: 0,
    items: []
  };
}

async function open() {
  visible.value = true;
  currentPage.value = 1;
  errorMessage.value = '';
  await loadDetails();
}

async function loadDetails() {
  if (!props.requirementPk) {
    pageData.value = emptyPage();
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    pageData.value = await apiClient.getRequirementTokenUsageDetails(
      props.requirementPk,
      currentPage.value,
      pageSize.value
    );
  } catch (error: any) {
    pageData.value = emptyPage();
    errorMessage.value = error?.message || 'Token 使用明细加载失败';
  } finally {
    loading.value = false;
  }
}

async function handlePageSizeChange() {
  currentPage.value = 1;
  await loadDetails();
}

function formatStage(stage?: WorkflowStage) {
  return stage ? stageLabels[stage] || stage : '-';
}

function formatStep(step?: WorkflowImplementationStep) {
  return step ? implementationStepLabels[step] || step : '-';
}

function formatOccurredAt(value?: string) {
  return value ? value.replace('T', ' ').replace(/\.\d+$/, '') : '-';
}

function formatTokenCount(value?: number) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

defineExpose({ open });
</script>

<style scoped>
.token-detail-content {
  display: grid;
  gap: 14px;
  min-height: 560px;
}

.token-detail-pagination {
  justify-self: end;
}

.stage-cell {
  display: grid;
  gap: 2px;
}

.stage-cell small {
  color: #64748b;
}
</style>
