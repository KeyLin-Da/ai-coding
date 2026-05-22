<template>
  <section class="workspace-band">
    <div class="toolbar">
      <div>
        <strong>需求工作流</strong>
        <p class="muted">按需求号聚合 PRD、技术方案、OpenSpec、单测和代码评审。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">创建/导入</el-button>
    </div>

    <el-table :data="store.requirements" v-loading="store.loading" style="width: 100%">
      <el-table-column prop="requirementId" label="需求号" width="140" />
      <el-table-column prop="title" label="标题" min-width="220" />
      <el-table-column prop="branchName" label="分支" min-width="180" />
      <el-table-column label="阶段" width="150">
        <template #default="{ row }">
          <el-tag>{{ stageText(row.currentStage) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近运行" min-width="180">
        <template #default="{ row }">
          <span class="muted">{{ row.runs[0]?.actionType || '暂无' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button :icon="View" size="small" @click="openDetail(row.requirementId)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>

  <el-dialog v-model="dialogVisible" title="创建或导入需求" width="560px">
    <el-form label-position="top">
      <el-form-item label="需求号" required>
        <el-input v-model="form.requirementId" placeholder="例如 172014" />
      </el-form-item>
      <el-form-item label="标题" required>
        <el-input v-model="form.title" placeholder="需求标题" />
      </el-form-item>
      <el-form-item label="需求类型" required>
        <el-radio-group v-model="form.requirementType">
          <el-radio-button label="REQUIREMENT">{{ requirementTypeLabels.REQUIREMENT }}</el-radio-button>
          <el-radio-button label="DEFECT">{{ requirementTypeLabels.DEFECT }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="分支名" required>
        <el-input v-model="form.branchName" :placeholder="branchNamePreview" @input="onBranchNameInput" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :icon="DocumentAdd" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { DocumentAdd, Plus, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { RequirementInput } from '@shared/workflow';
import { defaultBranchName, requirementTypeLabels, shouldSyncBranchName, stageLabels } from '@shared/workflow';
import { useWorkflowStore } from '@/stores/workflow';

const store = useWorkflowStore();
const router = useRouter();
const dialogVisible = ref(false);
const form = reactive<RequirementInput>({
  requirementId: '',
  title: '',
  requirementType: 'REQUIREMENT',
  branchName: ''
});
const lastAutoBranchName = ref('');
const branchNameEdited = ref(false);

const branchNamePreview = computed(() => {
  const requirementId = form.requirementId.trim() || '需求号';
  return defaultBranchName(requirementId, form.requirementType || 'REQUIREMENT');
});

function syncBranchName() {
  const nextAutoBranchName = branchNamePreview.value;
  if (shouldSyncBranchName(form.branchName, lastAutoBranchName.value, branchNameEdited.value)) {
    form.branchName = nextAutoBranchName;
  }
  lastAutoBranchName.value = nextAutoBranchName;
}

watch(() => [form.requirementId, form.requirementType], syncBranchName, { immediate: true });

function onBranchNameInput(value: string) {
  branchNameEdited.value = value.trim() !== '' && value.trim() !== lastAutoBranchName.value;
}

function stageText(stage: string) {
  return stage === 'DONE' ? '完成' : stageLabels[stage as keyof typeof stageLabels];
}

function openCreateDialog() {
  form.requirementId = '';
  form.title = '';
  form.requirementType = 'REQUIREMENT';
  form.branchName = '';
  branchNameEdited.value = false;
  lastAutoBranchName.value = '';
  syncBranchName();
  dialogVisible.value = true;
}

async function submit() {
  const requirementId = form.requirementId.trim();
  const title = form.title?.trim();
  const requirementType = form.requirementType || 'REQUIREMENT';
  const branchName = form.branchName?.trim() || defaultBranchName(requirementId, requirementType);

  if (!requirementId) {
    ElMessage.warning('请填写需求号');
    return;
  }
  if (!title) {
    ElMessage.warning('请填写标题');
    return;
  }
  if (!branchName) {
    ElMessage.warning('请填写分支名');
    return;
  }
  const workflow = await store.createRequirement({
    requirementId,
    title,
    requirementType,
    branchName
  });
  dialogVisible.value = false;
  router.push(`/requirements/${workflow.requirementId}`);
}

function openDetail(requirementId: string) {
  router.push(`/requirements/${requirementId}`);
}

onMounted(() => {
  store.loadRequirements();
});
</script>
