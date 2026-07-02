<template>
  <section class="workspace-band repository-required-page">
    <div class="toolbar">
      <div>
        <strong>补齐项目产物仓</strong>
        <p class="muted">{{ project.current?.name || '当前项目' }} 需要配置 AI 产物 Git 仓后才能推进需求流程。</p>
      </div>
      <el-button :icon="Back" @click="$router.push('/projects')">返回项目</el-button>
    </div>

    <el-alert
      type="warning"
      show-icon
      title="仓库地址补齐后不可修改，请确认这是只存 AI 交付产物的 Git 仓。"
      class="repository-alert"
    />

    <el-form label-position="top" class="repository-form">
      <el-form-item label="Git 平台" required>
        <el-select v-model="provider" style="width: 100%">
          <el-option label="GitLab" value="GITLAB" />
          <el-option label="GitHub" value="GITHUB" />
          <el-option label="Gitee" value="GITEE" />
          <el-option label="项目 Git" value="PROJECT_GIT" />
          <el-option label="其他" value="OTHER" />
        </el-select>
      </el-form-item>
      <el-form-item label="AI 产物 Git 仓" required>
        <el-input v-model="repoUrl" placeholder="git@git.example.com:opp/ai-delivery-artifacts.git" />
      </el-form-item>
      <el-form-item label="默认分支">
        <el-input v-model="defaultBranch" placeholder="master" />
      </el-form-item>
      <div class="form-actions">
        <el-button type="primary" :loading="saving" @click="save">保存并继续</el-button>
      </div>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Back } from '@element-plus/icons-vue';
import { useProjectStore } from '@/stores/project';

const router = useRouter();
const project = useProjectStore();
const provider = ref('GITLAB');
const repoUrl = ref('');
const defaultBranch = ref('master');
const saving = ref(false);

async function save() {
  const trimmedRepoUrl = repoUrl.value.trim();
  if (!trimmedRepoUrl) {
    ElMessage.warning('请填写 AI 产物 Git 仓地址');
    return;
  }
  saving.value = true;
  try {
    await project.bootstrapRepository({
      provider: provider.value,
      repoUrl: trimmedRepoUrl,
      defaultBranch: defaultBranch.value.trim() || 'master'
    });
    ElMessage.success('项目产物仓已补齐');
    router.push({ name: 'settings' });
  } catch (error: any) {
    ElMessage.error(error.message || '补齐项目产物仓失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.repository-required-page {
  max-width: 760px;
  margin: 0 auto;
}

.repository-alert {
  margin: 1rem 0;
}

.repository-form {
  max-width: 620px;
}

.form-actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 1rem;
}
</style>
