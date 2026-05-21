<template>
  <section class="workspace-band">
    <div class="toolbar">
      <div>
        <strong>需求工作流</strong>
        <p class="muted">按需求号聚合 PRD、技术方案、OpenSpec、单测和代码评审。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="dialogVisible = true">创建/导入</el-button>
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
      <el-form-item label="需求号">
        <el-input v-model="form.requirementId" placeholder="例如 172014" />
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="form.title" placeholder="需求标题" />
      </el-form-item>
      <el-form-item label="分支名">
        <el-input v-model="form.branchName" placeholder="feature/opp-172014" />
      </el-form-item>
      <el-form-item label="PRD 澄清描述">
        <el-input
          v-model="form.prdClarification"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="对应 /coding-prd-analyzer 的 c 参数，可填写范围边界、排除项、业务前提或术语定义"
        />
      </el-form-item>
      <el-form-item label="PRD 来源">
        <el-input v-model="sourcesText" type="textarea" :rows="3" placeholder="每行一个飞书、设计稿或本地文件来源" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :icon="DocumentAdd" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DocumentAdd, Plus, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { RequirementInput } from '@shared/workflow';
import { stageLabels } from '@shared/workflow';
import { useWorkflowStore } from '@/stores/workflow';

const store = useWorkflowStore();
const router = useRouter();
const dialogVisible = ref(false);
const sourcesText = ref('');
const form = reactive<RequirementInput>({
  requirementId: '',
  title: '',
  branchName: '',
  prdClarification: '',
  sources: []
});

function stageText(stage: string) {
  return stage === 'DONE' ? '完成' : stageLabels[stage as keyof typeof stageLabels];
}

async function submit() {
  if (!form.requirementId) {
    ElMessage.warning('请填写需求号');
    return;
  }
  const workflow = await store.createRequirement({
    ...form,
    sources: sourcesText.value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
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
