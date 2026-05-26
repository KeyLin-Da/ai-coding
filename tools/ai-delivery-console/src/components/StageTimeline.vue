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
      <span class="step-index">{{ workflow.stages[stage].status === 'APPROVED' ? '✓' : stageIndex(stage) }}</span>
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
  gap: 0;
  padding: 8px 16px 0;
  border-top: 1px solid #edf1f7;
  overflow-x: auto;
}

.stage-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 68px;
  padding: 12px 16px 16px;
  border: 0;
  border-bottom: 3px solid #d7deea;
  border-radius: 0;
  background: #fff;
  color: #1f2a3d;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.stage-step:hover {
  background: #f8fbff;
}

.stage-step.active {
  border-bottom-color: #2563eb;
  background: #f8fbff;
  color: #1d4ed8;
}

.stage-step.approved {
  border-bottom-color: #16a36a;
}

.stage-step.approved .step-index {
  background: #16a36a;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #64748b;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  flex: 0 0 auto;
}

.stage-step.active .step-index {
  background: #2563eb;
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

@media (max-width: 760px) {
  .stage-timeline {
    grid-template-columns: 1fr;
    padding: 8px 12px 12px;
    gap: 8px;
  }

  .stage-step {
    border: 1px solid #dbe3ef;
    border-left: 3px solid #d7deea;
    border-radius: 8px;
  }

  .stage-step.active {
    border-color: #bfdbfe;
    border-left-color: #2563eb;
  }

  .stage-step.approved {
    border-left-color: #16a36a;
  }
}
</style>
