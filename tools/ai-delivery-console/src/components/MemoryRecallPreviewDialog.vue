<template>
  <el-dialog :model-value="modelValue" title="生成技术方案" width="760px" append-to-body @update:model-value="updateVisible">
    <section v-if="step === 'gate'" class="memory-recall-gate">
      <el-checkbox v-model="enableRecall" class="memory-recall-checkbox">
        启用项目记忆召回
      </el-checkbox>
      <p class="memory-recall-description">
        从当前项目已确认的历史经验中查找可能相关的记忆。启用后会先展示候选列表，确认后才注入本次生成。
      </p>
    </section>

    <section v-else class="memory-recall-preview">
      <el-alert
        v-if="!previewItems.length && !loading"
        type="info"
        show-icon
        title="未匹配到相关项目记忆"
        description="可以继续生成，本次不会注入记忆召回内容。"
      />
      <div v-else class="memory-recall-toolbar">
        <span class="muted">候选 {{ previewItems.length }} 条，已选 {{ selectedIds.length }} 条</span>
        <div>
          <el-button link @click="selectAll">全选</el-button>
          <el-button link @click="clearSelection">取消选择</el-button>
        </div>
      </div>
      <el-table v-loading="loading" :data="previewItems" row-key="memoryId" class="memory-recall-table" max-height="420">
        <el-table-column width="48">
          <template #default="{ row }">
            <el-checkbox :model-value="selectedIds.includes(row.memoryId)" @change="(value) => toggleSelected(row.memoryId, value === true)" />
          </template>
        </el-table-column>
        <el-table-column label="记忆内容" min-width="260">
          <template #default="{ row }">
            <div class="memory-recall-statement">{{ row.statement }}</div>
            <div class="memory-recall-meta">
              <el-tag size="small" effect="plain">{{ row.type }}</el-tag>
              <el-tag size="small" :type="row.status === 'PENDING_VERIFY' ? 'warning' : 'success'" effect="light">{{ row.status }}</el-tag>
              <span>{{ row.sourceSummary || '项目记忆' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="命中原因" min-width="180">
          <template #default="{ row }">
            <div class="memory-recall-reasons">{{ row.reasons.join('；') || '-' }}</div>
            <small class="muted">分数 {{ row.score.toFixed(3) }}</small>
          </template>
        </el-table-column>
        <el-table-column label="移除原因" width="150">
          <template #default="{ row }">
            <el-select
              v-model="dismissedReasons[row.memoryId]"
              clearable
              placeholder="可选"
              size="small"
              :disabled="selectedIds.includes(row.memoryId)"
            >
              <el-option label="噪音大" value="NOISY" />
              <el-option label="不相关" value="IRRELEVANT" />
              <el-option label="已过期" value="OUTDATED" />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <template #footer>
      <div class="memory-recall-footer">
        <el-button @click="close">取消</el-button>
        <template v-if="step === 'gate'">
          <el-button @click="confirmDisabled">直接生成</el-button>
          <el-button type="primary" :loading="loading" @click="next">下一步：查看召回记忆</el-button>
        </template>
        <template v-else>
          <el-button @click="step = 'gate'">上一步</el-button>
          <el-button type="primary" @click="confirmEnabled">确认并生成</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ActionType, WorkflowStage } from '@shared/workflow';
import type { MemoryRecallActionInput, MemoryRecallDismissReason, MemoryRecallPreviewItem } from '@shared/memory';
import { apiClient } from '@/api/client';

const props = defineProps<{
  modelValue: boolean;
  requirementId: string;
  actionType: ActionType;
  stage?: WorkflowStage;
  sourceFilePaths: string[];
  clarification?: string;
  runIntent?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'confirm', value: MemoryRecallActionInput): void;
}>();

const step = ref<'gate' | 'preview'>('gate');
const enableRecall = ref(true);
const loading = ref(false);
const previewId = ref('');
const previewItems = ref<MemoryRecallPreviewItem[]>([]);
const selectedIds = ref<string[]>([]);
const dismissedReasons = reactive<Record<string, MemoryRecallDismissReason | ''>>({});

watch(() => props.modelValue, (visible) => {
  if (visible) {
    step.value = 'gate';
    enableRecall.value = true;
    previewId.value = '';
    previewItems.value = [];
    selectedIds.value = [];
    Object.keys(dismissedReasons).forEach((key) => {
      delete dismissedReasons[key];
    });
  }
});

function updateVisible(value: boolean) {
  emit('update:modelValue', value);
}

function close() {
  emit('update:modelValue', false);
}

function selectAll() {
  selectedIds.value = previewItems.value.map((item) => item.memoryId);
}

function clearSelection() {
  selectedIds.value = [];
}

function toggleSelected(memoryId: string, selected: boolean) {
  if (selected) {
    selectedIds.value = Array.from(new Set([...selectedIds.value, memoryId]));
    dismissedReasons[memoryId] = '';
  } else {
    selectedIds.value = selectedIds.value.filter((item) => item !== memoryId);
  }
}

async function next() {
  if (!enableRecall.value) {
    confirmDisabled();
    return;
  }
  loading.value = true;
  try {
    const preview = await apiClient.previewRequirementMemoryRecall(props.requirementId, {
      actionType: props.actionType,
      stage: props.stage,
      sourceFilePaths: props.sourceFilePaths,
      clarification: props.clarification,
      runIntent: props.runIntent
    });
    previewId.value = preview.previewId;
    previewItems.value = preview.items;
    selectedIds.value = preview.items.filter((item) => item.selectedByDefault).map((item) => item.memoryId);
    step.value = 'preview';
  } catch (error: any) {
    ElMessage.error(error.message || '记忆召回预览失败');
  } finally {
    loading.value = false;
  }
}

function confirmDisabled() {
  emit('update:modelValue', false);
  emit('confirm', { enabled: false });
}

function confirmEnabled() {
  const dismissed = Object.entries(dismissedReasons)
    .filter(([memoryId, reason]) => reason && !selectedIds.value.includes(memoryId))
    .map(([memoryId, reason]) => ({ memoryId, reason: reason as MemoryRecallDismissReason }));
  emit('update:modelValue', false);
  emit('confirm', {
    enabled: true,
    previewId: previewId.value,
    selectedMemoryIds: selectedIds.value,
    dismissed
  });
}
</script>

<style scoped>
.memory-recall-gate {
  padding: 8px 0 2px;
}

.memory-recall-checkbox {
  font-weight: 600;
}

.memory-recall-description,
.muted {
  color: #667085;
}

.memory-recall-description {
  margin: 8px 0 0 24px;
  line-height: 1.6;
}

.memory-recall-toolbar,
.memory-recall-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.memory-recall-toolbar {
  margin-bottom: 10px;
}

.memory-recall-statement {
  line-height: 1.5;
  word-break: break-word;
}

.memory-recall-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  color: #667085;
  font-size: 12px;
}

.memory-recall-reasons {
  line-height: 1.45;
  word-break: break-word;
}
</style>
