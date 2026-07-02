<template>
  <el-dialog v-model="visible" title="分享产物" width="620px">
    <div class="share-section">
      <h3>需要登录的分享</h3>
      <p class="muted">拥有项目权限的成员登录后，可以打开同一个产物预览页面。</p>
      <el-input :model-value="loginShareUrl" readonly>
        <template #append>
          <el-button :icon="CopyDocument" @click="copy(loginShareUrl)">复制</el-button>
        </template>
      </el-input>
    </div>

    <div class="share-section">
      <h3>公开分享</h3>
      <p class="muted">公开链接展示当前最新内容，不是固定快照；撤销或过期后将无法访问。</p>
      <div class="share-options">
        <el-date-picker v-model="expireAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="过期时间，可不填" />
        <el-checkbox v-model="showAnnotations">展示批注</el-checkbox>
        <el-checkbox v-model="allowDownload">允许下载</el-checkbox>
      </div>
      <el-button type="primary" :loading="creating" @click="createPublicShare">创建公开链接</el-button>
      <div v-if="publicShareUrl" class="public-url">
        <el-input :model-value="publicShareUrl" readonly>
          <template #append>
            <el-button :icon="CopyDocument" @click="copy(publicShareUrl)">复制</el-button>
          </template>
        </el-input>
      </div>
      <el-table v-if="shares.length" v-loading="loadingShares" :data="shares" size="small" class="share-table">
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column prop="expireAt" label="过期时间" min-width="150" />
        <el-table-column prop="accessCount" label="访问" width="80" />
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'ENABLED' && row.publicPath"
              link
              type="primary"
              @click="copy(absoluteUrl(row.publicPath))"
            >
              复制
            </el-button>
            <el-button
              v-else-if="row.status === 'ENABLED'"
              link
              type="primary"
              @click="regenerate(row)"
            >
              重新生成
            </el-button>
            <el-button link type="danger" :disabled="row.status === 'REVOKED'" @click="revoke(row)">撤销</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ArtifactRef } from '@shared/workflow';
import { apiClient, type ArtifactShareVO } from '@/api/client';

const visible = ref(false);
const artifact = ref<ArtifactRef>();
const projectId = ref<string | number>('');
const requirementPk = ref<string | number | undefined>();
const requirementId = ref('');
const expireAt = ref('');
const showAnnotations = ref(true);
const allowDownload = ref(true);
const creating = ref(false);
const loadingShares = ref(false);
const shares = ref<ArtifactShareVO[]>([]);
const publicShareUrl = ref('');

const loginShareUrl = computed(() => {
  if (!artifact.value?.path || !projectId.value || !requirementId.value) {
    return '';
  }
  const params = new URLSearchParams({
    projectId: String(projectId.value),
    requirementId: requirementId.value,
    path: artifact.value.path
  });
  return absoluteUrl(`/artifacts/preview?${params.toString()}`);
});

function absoluteUrl(path: string) {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') {
    return path;
  }
  return new URL(path, window.location.origin).toString();
}

function inferRequirementId(filePath: string) {
  return filePath.match(/^docs\/([^/]+)\//)?.[1] || '';
}

async function open(input: { artifact: ArtifactRef; projectId: string | number; requirementPk?: string | number; requirementId?: string }) {
  artifact.value = input.artifact;
  projectId.value = input.projectId;
  requirementPk.value = input.requirementPk;
  requirementId.value = input.requirementId || inferRequirementId(input.artifact.path);
  expireAt.value = '';
  showAnnotations.value = true;
  allowDownload.value = true;
  publicShareUrl.value = '';
  visible.value = true;
  await loadShares();
}

async function loadShares() {
  if (!projectId.value || !requirementId.value || !artifact.value?.path) {
    shares.value = [];
    return;
  }
  loadingShares.value = true;
  try {
    shares.value = await apiClient.listPublicArtifactShares({
      projectId: projectId.value,
      requirementId: requirementId.value,
      artifactPath: artifact.value.path
    });
    const reusable = shares.value.find((share) => share.status === 'ENABLED' && share.publicPath);
    if (reusable?.publicPath) {
      publicShareUrl.value = absoluteUrl(reusable.publicPath);
    }
  } catch (error: any) {
    shares.value = [];
    publicShareUrl.value = '';
    ElMessage.error(error.message || '读取公开分享记录失败');
  } finally {
    loadingShares.value = false;
  }
}

async function copy(value: string) {
  if (!value) {
    return;
  }
  await navigator.clipboard.writeText(value).catch(() => undefined);
  ElMessage.success('链接已复制');
}

async function createPublicShare() {
  if (!artifact.value?.path || !projectId.value || !requirementId.value) {
    ElMessage.warning('缺少产物或项目信息');
    return;
  }
  creating.value = true;
  try {
    const share = await apiClient.createPublicArtifactShare({
      projectId: projectId.value,
      requirementPk: requirementPk.value,
      requirementId: requirementId.value,
      artifactPath: artifact.value.path,
      expireAt: expireAt.value || undefined,
      showAnnotations: showAnnotations.value,
      allowDownload: allowDownload.value
    });
    const path = share.publicPath || (share.token ? `/share/artifacts/${encodeURIComponent(share.token)}` : '');
    publicShareUrl.value = path ? absoluteUrl(path) : '';
    await loadShares();
    if (publicShareUrl.value) {
      await copy(publicShareUrl.value);
    }
  } catch (error: any) {
    ElMessage.error(error.message || '创建公开分享失败');
  } finally {
    creating.value = false;
  }
}

async function revoke(row: ArtifactShareVO) {
  try {
    await apiClient.revokePublicArtifactShare(row.id);
    await loadShares();
    ElMessage.success('公开链接已撤销');
  } catch (error: any) {
    ElMessage.error(error.message || '撤销公开链接失败');
  }
}

async function regenerate(row: ArtifactShareVO) {
  try {
    await ElMessageBox.confirm('重新生成后，原公开链接将立即失效。是否继续？', '重新生成公开链接', {
      confirmButtonText: '重新生成并复制',
      cancelButtonText: '取消',
      type: 'warning'
    });
    const share = await apiClient.regeneratePublicArtifactShareToken(row.id);
    const path = share.publicPath || (share.token ? `/share/artifacts/${encodeURIComponent(share.token)}` : '');
    publicShareUrl.value = path ? absoluteUrl(path) : '';
    await loadShares();
    if (publicShareUrl.value) {
      await copy(publicShareUrl.value);
    }
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return;
    }
    ElMessage.error(error.message || '重新生成公开链接失败');
  }
}

defineExpose({ open });
</script>

<style scoped>
.share-section {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.share-section h3 {
  margin: 0;
  font-size: 16px;
}

.muted {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.share-options {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.public-url,
.share-table {
  margin-top: 10px;
}
</style>
