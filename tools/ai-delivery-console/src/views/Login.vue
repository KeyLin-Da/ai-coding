<template>
  <section class="auth-page">
    <div class="auth-panel">
      <div class="auth-heading">
        <p class="eyebrow">AI Delivery Console</p>
        <h2>登录到需求交付控制台</h2>
      </div>

      <el-tabs v-model="mode" stretch>
        <el-tab-pane label="账号登录" name="login">
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="用户账号" required>
              <el-input v-model="form.account" placeholder="输入工号、邮箱或自定义账号" @keyup.enter="submit" />
            </el-form-item>
            <el-button type="primary" :loading="auth.loading" @click="submit">登录</el-button>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="创建用户" name="register">
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="用户账号" required>
              <el-input v-model="form.account" placeholder="输入工号、邮箱或自定义账号" />
            </el-form-item>
            <el-form-item label="展示名称" required>
              <el-input v-model="form.displayName" placeholder="用于协作中展示" @keyup.enter="submit" />
            </el-form-item>
            <el-button type="primary" :loading="auth.loading" @click="submit">创建并登录</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const auth = useAuthStore();
const project = useProjectStore();
const settings = useSettingsStore();
const mode = ref<'login' | 'register'>('login');
const form = reactive({
  account: '',
  displayName: ''
});

async function submit() {
  const account = form.account.trim();
  const displayName = form.displayName.trim();
  if (!account) {
    ElMessage.warning('请填写用户账号');
    return;
  }
  if (mode.value === 'register' && !displayName) {
    ElMessage.warning('请填写展示名称');
    return;
  }
  try {
    if (mode.value === 'register') {
      await auth.register(account, displayName);
    } else {
      await auth.login(account);
    }
    await settings.ensureClientSessionId();
    await project.loadProjects();
    ElMessage.success('登录成功');
    const currentRoute = 'currentRoute' in router ? router.currentRoute.value : undefined;
    const redirect = typeof currentRoute?.query?.redirect === 'string' ? currentRoute.query.redirect : '';
    router.push(redirect || (project.current ? { name: 'requirements' } : { name: 'projects' }));
  } catch (error: any) {
    ElMessage.error(error.message || '登录失败');
  }
}
</script>

<style scoped>
.auth-page {
  display: grid;
  min-height: calc(100vh - 140px);
  place-items: center;
}

.auth-panel {
  width: min(420px, 100%);
  padding: 28px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
}

.auth-heading {
  margin-bottom: 20px;
}

.auth-heading h2 {
  margin: 4px 0 0;
  font-size: 24px;
}
</style>
