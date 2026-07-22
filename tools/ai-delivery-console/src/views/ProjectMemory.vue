<template>
  <section class="memory-page">
    <div class="toolbar">
      <div>
        <strong>{{ title }}</strong>
        <p class="muted">{{ description }}</p>
      </div>
      <div class="toolbar-actions">
        <el-input
          v-model="keyword"
          class="keyword-input"
          clearable
          :prefix-icon="Search"
          placeholder="搜索经验 / 标签 / 来源"
          @keyup.enter="load"
        />
        <el-button v-if="view === 'cards'" type="primary" :icon="Plus" @click="openManualDialog">新建经验</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div v-if="view === 'cards' || view === 'archived'" class="filter-row">
      <el-select v-model="cardType" clearable placeholder="记忆分类">
        <el-option label="技术经验" value="TECH_EXPERIENCE" />
        <el-option label="业务规则" value="BUSINESS_RULE" />
        <el-option label="风险教训" value="RISK_LESSON" />
        <el-option label="团队偏好" value="TEAM_PREFERENCE" />
        <el-option label="技术假设" value="TECH_HYPOTHESIS" />
      </el-select>
      <el-select v-model="stage" clearable placeholder="适用阶段">
        <el-option label="技术方案" value="TECH_DESIGN" />
        <el-option label="实施验证" value="IMPLEMENTATION" />
        <el-option label="代码评审" value="CODE_REVIEW" />
        <el-option label="交付复盘" value="RETROSPECTIVE" />
      </el-select>
    </div>

    <el-table v-if="view === 'cards' || view === 'archived'" v-loading="loading" :data="cards.items" style="width: 100%">
      <el-table-column label="经验" min-width="320">
        <template #default="{ row }">
          <div class="memory-statement">
            <strong>{{ row.statement }}</strong>
            <div class="tag-line">
              <el-tag size="small" effect="plain">{{ typeText(row.type) }}</el-tag>
              <el-tag size="small" :type="row.status === 'ACTIVE' ? 'success' : 'warning'" effect="plain">{{ statusText(row.status) }}</el-tag>
              <el-tag v-for="tag in row.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="适用范围" min-width="220">
        <template #default="{ row }">
          <span>{{ row.appliesTo.modules.join(', ') || '全部工程' }}</span>
          <p class="muted">{{ row.appliesTo.stages.join(', ') || '全部阶段' }}</p>
        </template>
      </el-table-column>
      <el-table-column label="来源" min-width="180">
        <template #default="{ row }">
          <span>{{ row.evidence?.[0]?.requirementId || '-' }}</span>
          <p class="muted">{{ row.evidence?.[0]?.sourceType || '-' }}</p>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="openDetail(row)">详情</el-button>
          <el-button size="small" :icon="Edit" @click="openMemoryEditDialog(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <MemoryCandidateTable
      v-if="view === 'candidates'"
      :items="candidates.items"
      :loading="loading"
      show-source
      @confirm="confirmCandidate"
      @edit="editCandidate"
      @pending="markPendingVerify"
      @local="markLocal"
      @ignore="ignoreCandidate"
    />

    <el-table v-if="view === 'recalls'" v-loading="loading" :data="recalls.items" style="width: 100%">
      <el-table-column prop="requirementId" label="需求号" width="130" />
      <el-table-column prop="memoryId" label="记忆 ID" min-width="220" />
      <el-table-column prop="actionType" label="动作" width="150" />
      <el-table-column prop="recallStatus" label="状态" width="180">
        <template #default="{ row }">
          <el-tag effect="plain">{{ row.recallStatus }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="injectedPath" label="召回产物" min-width="260" />
      <el-table-column prop="updatedAt" label="时间" width="190" />
    </el-table>

    <div v-if="isEmpty && !loading" class="memory-empty">
      <el-empty description="暂无项目记忆数据" />
      <span class="sr-only">暂无项目记忆数据</span>
    </div>

    <el-drawer v-model="detailVisible" title="记忆详情" size="46%">
      <template v-if="selectedCard">
        <h3>{{ selectedCard.statement }}</h3>
        <p class="muted">状态: {{ statusText(selectedCard.status) }} · 分类: {{ typeText(selectedCard.type) }}</p>
        <el-button size="small" :icon="Edit" @click="openMemoryEditDialog(selectedCard)">编辑经验</el-button>
        <h4>来源证据</h4>
        <div v-for="evidence in selectedCard.evidence" :key="`${evidence.sourceType}-${evidence.path}-${evidence.runId}`" class="evidence-block">
          <strong>{{ evidence.sourceType }} · {{ evidence.requirementId }}</strong>
          <p>{{ evidence.quote }}</p>
          <p class="muted">{{ evidence.path || evidence.artifactPath || '-' }} · {{ evidence.runId || '-' }}</p>
        </div>
        <h4>修改记录</h4>
        <div v-if="!revisions.length" class="muted">暂无修改记录</div>
        <div v-for="revision in revisions" :key="revision.id" class="evidence-block">
          <strong>{{ revision.createdAt }}</strong>
          <p>{{ revision.changeReason || '未填写修改原因' }}</p>
          <p class="muted">{{ revision.before.statement }} → {{ revision.after.statement }}</p>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="editVisible" title="编辑候选经验" width="620px">
      <el-form label-position="top">
        <el-form-item label="经验描述">
          <el-input v-model="editForm.statement" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="标签（逗号分隔）">
          <el-input v-model="editForm.tags" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmEditedCandidate">确认沉淀</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="manualVisible" :title="manualEditingCard ? '编辑项目经验' : '新建项目经验'" width="680px">
      <el-form label-position="top">
        <el-form-item label="经验描述">
          <el-input v-model="manualForm.statement" type="textarea" :rows="4" placeholder="例如：涉及 nacos 配置读取时，优先检查公共配置接口是否可复用" />
        </el-form-item>
        <div class="manual-grid">
          <el-form-item label="记忆分类">
            <el-select v-model="manualForm.type">
              <el-option label="技术经验" value="TECH_EXPERIENCE" />
              <el-option label="业务规则" value="BUSINESS_RULE" />
              <el-option label="风险教训" value="RISK_LESSON" />
              <el-option label="团队偏好" value="TEAM_PREFERENCE" />
              <el-option label="技术假设" value="TECH_HYPOTHESIS" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="manualForm.status">
              <el-option label="生效中" value="ACTIVE" />
              <el-option label="待验证" value="PENDING_VERIFY" />
              <el-option v-if="manualEditingCard" label="已过期" value="STALE" />
              <el-option v-if="manualEditingCard" label="已废弃" value="REJECTED" />
            </el-select>
          </el-form-item>
        </div>
        <div class="manual-grid">
          <el-form-item label="适用工程（逗号分隔）">
            <el-input v-model="manualForm.modules" placeholder="opp-learn, opp-api" />
          </el-form-item>
          <el-form-item label="适用阶段">
            <el-select v-model="manualForm.stages" multiple collapse-tags collapse-tags-tooltip clearable>
              <el-option label="PRD" value="PRD" />
              <el-option label="技术方案" value="TECH_DESIGN" />
              <el-option label="实施验证" value="IMPLEMENTATION" />
              <el-option label="代码评审" value="CODE_REVIEW" />
              <el-option label="交付复盘" value="RETROSPECTIVE" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="标签（逗号分隔）">
          <el-input v-model="manualForm.tags" placeholder="nacos, 配置, 复用" />
        </el-form-item>
        <el-form-item label="依据说明">
          <el-input v-model="manualForm.evidenceQuote" type="textarea" :rows="3" placeholder="补充这条经验的来源或适用前提" />
        </el-form-item>
        <el-form-item v-if="manualEditingCard" label="修改原因">
          <el-input v-model="manualForm.changeReason" type="textarea" :rows="2" placeholder="说明为什么修改这条项目经验" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualVisible = false">取消</el-button>
        <el-button type="primary" :loading="manualSaving" @click="createManualMemory">保存经验</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Edit, Plus, Refresh, Search, View } from '@element-plus/icons-vue';
import type { MemoryCandidate, MemoryCard, MemoryCardRevision, MemoryCardStatus, MemoryPage, MemoryRecallRecord, MemoryType } from '@shared/memory';
import type { WorkflowStage } from '@shared/workflow';
import { apiClient } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import MemoryCandidateTable from '@/components/MemoryCandidateTable.vue';

const props = defineProps<{
  view: 'cards' | 'candidates' | 'recalls' | 'archived';
}>();

const route = useRoute();
const project = useProjectStore();
const loading = ref(false);
const keyword = ref('');
const cardType = ref<MemoryType | ''>('');
const stage = ref<WorkflowStage | ''>('');
const cards = ref<MemoryPage<MemoryCard>>({ items: [], total: 0, page: 1, pageSize: 50 });
const candidates = ref<MemoryPage<MemoryCandidate>>({ items: [], total: 0, page: 1, pageSize: 50 });
const recalls = ref<MemoryPage<MemoryRecallRecord>>({ items: [], total: 0, page: 1, pageSize: 50 });
const detailVisible = ref(false);
const selectedCard = ref<MemoryCard | null>(null);
const revisions = ref<MemoryCardRevision[]>([]);
const editVisible = ref(false);
const editingCandidate = ref<MemoryCandidate | null>(null);
const editForm = ref({ statement: '', tags: '' });
const manualVisible = ref(false);
const manualSaving = ref(false);
const manualEditingCard = ref<MemoryCard | null>(null);
const manualForm = ref<{
  statement: string;
  type: MemoryType;
  status: MemoryCardStatus;
  modules: string;
  stages: WorkflowStage[];
  tags: string;
  evidenceQuote: string;
  changeReason: string;
}>({
  statement: '',
  type: 'TECH_EXPERIENCE',
  status: 'ACTIVE',
  modules: '',
  stages: ['TECH_DESIGN'],
  tags: '',
  evidenceQuote: '',
  changeReason: ''
});

const title = computed(() => {
  if (props.view === 'candidates') return '待确认经验';
  if (props.view === 'recalls') return '召回记录';
  if (props.view === 'archived') return '过期/废弃经验';
  return '项目经验库';
});

const description = computed(() => {
  if (props.view === 'candidates') return '展示已参与产物生成、等待用户确认是否沉淀的经验。';
  if (props.view === 'recalls') return '追踪项目记忆被哪些需求、动作和产物召回使用。';
  if (props.view === 'archived') return '查看已过期、废弃或被拒绝的项目记忆。';
  return '管理当前项目已确认的技术经验、业务规则、风险教训和团队偏好。';
});

const isEmpty = computed(() => {
  if (props.view === 'candidates') return candidates.value.items.length === 0;
  if (props.view === 'recalls') return recalls.value.items.length === 0;
  return cards.value.items.length === 0;
});

function typeText(type: string): string {
  const map: Record<string, string> = {
    TECH_EXPERIENCE: '技术经验',
    BUSINESS_RULE: '业务规则',
    RISK_LESSON: '风险教训',
    TEAM_PREFERENCE: '团队偏好',
    TECH_HYPOTHESIS: '技术假设'
  };
  return map[type] || type;
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    PENDING_CONFIRM: '待确认',
    PENDING_VERIFY: '待验证',
    LOCAL_ONLY: '仅本需求',
    IGNORED: '已忽略',
    CONFIRMED: '已沉淀',
    ACTIVE: '生效中',
    STALE: '已过期',
    REJECTED: '已废弃'
  };
  return map[status] || status;
}

async function load() {
  if (!project.current) return;
  loading.value = true;
  try {
    const projectId = String(project.current.id);
    if (props.view === 'candidates') {
      candidates.value = await apiClient.listMemoryCandidates({
        projectId,
        requirementId: typeof route.query.requirementId === 'string' ? route.query.requirementId : undefined,
        status: ['PENDING_CONFIRM', 'PENDING_VERIFY'],
        keyword: keyword.value,
        pageSize: 100
      });
      return;
    }
    if (props.view === 'recalls') {
      recalls.value = await apiClient.listMemoryRecalls({
        projectId,
        requirementId: typeof route.query.requirementId === 'string' ? route.query.requirementId : undefined
      });
      return;
    }
    cards.value = await apiClient.listMemoryCards({
      projectId,
      status: props.view === 'archived' ? ['STALE', 'REJECTED'] : ['ACTIVE', 'PENDING_VERIFY'],
      type: cardType.value || undefined,
      stage: stage.value || undefined,
      keyword: keyword.value,
      pageSize: 100
    });
  } catch (error: any) {
    ElMessage.error(error.message || '加载项目记忆失败');
  } finally {
    loading.value = false;
  }
}

async function openDetail(row: MemoryCard) {
  selectedCard.value = row;
  revisions.value = [];
  detailVisible.value = true;
  try {
    revisions.value = await apiClient.listMemoryCardRevisions(row.id);
  } catch {
    revisions.value = [];
  }
}

function splitList(value: string): string[] {
  return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
}

function openManualDialog() {
  manualEditingCard.value = null;
  manualForm.value = {
    statement: '',
    type: 'TECH_EXPERIENCE',
    status: 'ACTIVE',
    modules: '',
    stages: ['TECH_DESIGN'],
    tags: '',
    evidenceQuote: '',
    changeReason: ''
  };
  manualVisible.value = true;
}

function openMemoryEditDialog(row: MemoryCard) {
  manualEditingCard.value = row;
  manualForm.value = {
    statement: row.statement,
    type: row.type,
    status: row.status,
    modules: row.appliesTo.modules.join(', '),
    stages: [...row.appliesTo.stages],
    tags: row.tags.join(', '),
    evidenceQuote: '',
    changeReason: ''
  };
  manualVisible.value = true;
}

async function createManualMemory() {
  if (!project.current) return;
  const statement = manualForm.value.statement.trim();
  if (!statement) {
    ElMessage.error('请填写经验描述');
    return;
  }
  manualSaving.value = true;
  try {
    const input = {
      projectId: String(project.current.id),
      statement,
      type: manualForm.value.type,
      status: manualForm.value.status,
      tags: splitList(manualForm.value.tags),
      appliesTo: {
        modules: splitList(manualForm.value.modules),
        stages: manualForm.value.stages
      },
      evidenceQuote: manualForm.value.evidenceQuote.trim(),
      changeReason: manualForm.value.changeReason.trim()
    };
    const saved = manualEditingCard.value
      ? await apiClient.updateMemoryCard(manualEditingCard.value.id, input)
      : await apiClient.createMemoryCard(input);
    manualVisible.value = false;
    selectedCard.value = selectedCard.value?.id === saved.id ? saved : selectedCard.value;
    ElMessage.success(manualEditingCard.value ? '项目经验已更新' : '项目经验已保存');
    await load();
    if (detailVisible.value && saved.id) {
      revisions.value = await apiClient.listMemoryCardRevisions(saved.id).catch(() => []);
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存项目经验失败');
  } finally {
    manualSaving.value = false;
  }
}

async function confirmCandidate(row: MemoryCandidate) {
  try {
    await apiClient.confirmMemoryCandidate(row.id);
    ElMessage.success('经验已沉淀');
    await load();
  } catch (error: any) {
    ElMessage.error(error.message || '确认失败');
  }
}

function editCandidate(row: MemoryCandidate) {
  editingCandidate.value = row;
  editForm.value = {
    statement: row.statement,
    tags: row.tags.join(', ')
  };
  editVisible.value = true;
}

async function confirmEditedCandidate() {
  if (!editingCandidate.value) return;
  try {
    await apiClient.confirmMemoryCandidate(editingCandidate.value.id, {
      statement: editForm.value.statement,
      tags: editForm.value.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
    });
    editVisible.value = false;
    ElMessage.success('经验已沉淀');
    await load();
  } catch (error: any) {
    ElMessage.error(error.message || '确认失败');
  }
}

async function markLocal(row: MemoryCandidate) {
  try {
    await apiClient.updateMemoryCandidateStatus(row.id, { status: 'LOCAL_ONLY' });
    ElMessage.success('已标记为仅本需求有效');
    await load();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  }
}

async function markPendingVerify(row: MemoryCandidate) {
  try {
    await apiClient.updateMemoryCandidateStatus(row.id, { status: 'PENDING_VERIFY' });
    ElMessage.success('已标记为待验证');
    await load();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  }
}

async function ignoreCandidate(row: MemoryCandidate) {
  try {
    await apiClient.ignoreMemoryCandidate(row.id);
    ElMessage.success('已忽略');
    await load();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  }
}

onMounted(load);
watch(() => props.view, load);
watch(() => route.query.requirementId, load);
watch([cardType, stage], load);
</script>

<style scoped>
.memory-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.manual-grid,
.toolbar,
.filter-row,
.tag-line {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar {
  justify-content: space-between;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.manual-grid {
  align-items: flex-start;
}

.manual-grid > :deep(.el-form-item) {
  flex: 1;
}

.keyword-input {
  width: 280px;
}

.memory-statement {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.muted {
  margin: 0;
  color: #718096;
  font-size: 13px;
}

.evidence-block {
  padding: 12px 0;
  border-bottom: 1px solid #e5e7eb;
}

.memory-empty {
  width: 100%;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 960px) {
  .toolbar,
  .toolbar-actions,
  .filter-row,
  .manual-grid {
    align-items: stretch;
    flex-direction: column;
  }

  .keyword-input {
    width: 100%;
  }
}
</style>
