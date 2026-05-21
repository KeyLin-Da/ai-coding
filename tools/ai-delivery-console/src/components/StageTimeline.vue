<template>
  <div class="stage-timeline" aria-label="阶段时间线">
    <button
      v-for="stage in workflowStages"
      :key="stage"
      class="stage-step"
      :class="{ active: modelValue === stage, approved: workflow.stages[stage].status === 'APPROVED' }"
      type="button"
      @click="$emit('update:modelValue', stage)"
    >
      <span class="step-index">{{ stageIndex(stage) }}</span>
      <span class="step-main">
        <strong>{{ stageLabels[stage] }}</strong>
        <small>{{ statusLabels[workflow.stages[stage].status] }}</small>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { RequirementWorkflow, WorkflowStage } from '@shared/workflow';
import { stageLabels, statusLabels, workflowStages } from '@shared/workflow';

defineProps<{
  workflow: RequirementWorkflow;
  modelValue: WorkflowStage;
}>();

defineEmits<{
  (event: 'update:modelValue', value: WorkflowStage): void;
}>();

function stageIndex(stage: WorkflowStage) {
  return workflowStages.indexOf(stage) + 1;
}
</script>

<style scoped>
.stage-timeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #e3e8f2;
  overflow-x: auto;
}

.stage-step {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 10px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  color: #1f2a3d;
  text-align: left;
  cursor: pointer;
}

.stage-step.active {
  border-color: #2563eb;
  background: #f0f6ff;
}

.stage-step.approved .step-index {
  background: #16875a;
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
</style>
