<template>
  <el-dialog v-model="visible" title="提交审核结论" width="520px">
    <el-form label-position="top">
      <el-alert v-if="implementationStepLabel" :title="implementationStepLabel" type="info" show-icon />
      <el-form-item label="结论">
        <el-radio-group v-model="decision">
          <el-radio-button label="APPROVED">通过</el-radio-button>
          <el-radio-button label="REJECTED">打回</el-radio-button>
          <el-radio-button label="RISK_ACCEPTED">带风险通过</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="审核意见">
        <el-input v-model="comment" type="textarea" :rows="4" placeholder="记录审核依据、打回原因或风险说明" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :icon="Check" @click="submit">提交</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Check } from '@element-plus/icons-vue';
import type { ImplementationStep, ReviewDecision, WorkflowStage } from '@shared/workflow';
import { implementationStepLabels } from '@shared/workflow';

const visible = ref(false);
const decision = ref<ReviewDecision>('APPROVED');
const comment = ref('');
const stage = ref<WorkflowStage>('PRD');
const implementationStep = ref<ImplementationStep | undefined>();
const artifactPath = ref<string | undefined>();
const implementationStepLabel = ref('');

const emit = defineEmits<{
  (event: 'submit', value: { stage: WorkflowStage; implementationStep?: ImplementationStep; decision: ReviewDecision; comment: string; artifactPath?: string }): void;
}>();

function open(nextStage: WorkflowStage, path?: string, nextImplementationStep?: ImplementationStep) {
  stage.value = nextStage;
  implementationStep.value = nextImplementationStep;
  implementationStepLabel.value = nextImplementationStep ? `实施验证子步骤：${implementationStepLabels[nextImplementationStep]}` : '';
  artifactPath.value = path;
  decision.value = 'APPROVED';
  comment.value = '';
  visible.value = true;
}

function submit() {
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
