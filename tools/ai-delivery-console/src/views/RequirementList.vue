<template>
  <section class="workspace-band">
    <div class="toolbar">
      <div>
        <strong>需求工作流</strong>
        <p class="muted">按需求号聚合 PRD、技术方案、OpenSpec、单测和代码评审。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">创建/导入</el-button>
    </div>

    <div class="filter-panel" aria-label="需求筛选">
      <el-input
        v-model="filters.keyword"
        class="filter-keyword filter-control"
        clearable
        :prefix-icon="Search"
        placeholder="搜索需求号 / 标题"
      />
      <el-select v-model="filters.requirementType" class="filter-control" clearable placeholder="需求类型">
        <el-option
          v-for="option in requirementTypeOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <el-select v-model="filters.stage" class="filter-control" clearable placeholder="阶段">
        <el-option v-for="option in stageFilterOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="filters.projectPaths" class="filter-control" multiple clearable collapse-tags placeholder="涉及工程">
        <el-option v-for="option in projectFilterOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <div class="filter-actions">
        <span class="filter-count">{{ filterSummaryText }}</span>
        <el-button class="clear-filter-button" :disabled="!hasActiveFilters" link @click="clearFilters">清空</el-button>
      </div>
    </div>

    <el-table :data="pagedRequirements" v-loading="store.loading" style="width: 100%">
      <el-table-column prop="requirementId" label="需求号" width="140" />
      <el-table-column prop="title" label="标题" min-width="220" />
      <el-table-column prop="requirementType" label="需求类型" min-width="140">
        <template #default="{ row }">
          <el-tag :class="stageTagClass(row.requirementType)" effect="plain">{{ stageRequirementType(row.requirementType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="branchName" label="分支" min-width="180" />
      <el-table-column label="涉及工程" min-width="220">
        <template #default="{ row }">
          <div v-if="row.projects?.length" class="project-tags">
            <el-tooltip
              v-for="project in row.projects"
              :key="project.path"
              :content="project.path"
              placement="top"
              :show-after="300"
            >
              <el-tag class="project-tag" size="small" effect="plain">
                {{ projectDisplayName(project) }}
              </el-tag>
            </el-tooltip>
          </div>
          <span v-else class="muted">未配置</span>
        </template>
      </el-table-column>
      <el-table-column label="阶段" width="150">
        <template #default="{ row }">
          <el-tag :class="stageTagClass(row.currentStage)" effect="plain">{{ stageText(row.currentStage) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近运行" min-width="180">
        <template #default="{ row }">
          <span :class="{ muted: !row.runs[0] }">{{ recentRunText(row.runs[0]) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="协作" min-width="180">
        <template #default="{ row }">
          <div class="collaboration-tags">
            <el-tag v-if="row.onlineClientCount !== undefined" size="small" type="success" effect="plain">在线 {{ row.onlineClientCount }}</el-tag>
            <el-tag v-if="row.pendingReviewCount !== undefined" size="small" type="warning" effect="plain">待审 {{ row.pendingReviewCount }}</el-tag>
            <el-tag v-if="row.jobStatus" size="small" type="info" effect="plain">{{ row.jobStatus }}</el-tag>
            <span v-if="row.onlineClientCount === undefined && row.pendingReviewCount === undefined && !row.jobStatus" class="muted">-</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button :icon="View" size="small" @click="openDetail(row.requirementId)">查看</el-button>
          <el-button :icon="Edit" size="small" @click="openEditDialog(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="filteredRequirements.length" class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="pageSizeOptions"
        :total="filteredRequirements.length"
        background
        layout="total, sizes, prev, pager, next, jumper"
      />
    </div>
  </section>

  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px">
    <el-form label-position="top">
      <el-form-item label="需求号" required>
        <el-input v-model="form.requirementId" placeholder="例如 172014" :disabled="isEditingWorkflow" />
      </el-form-item>
      <el-form-item label="标题" required>
        <el-input v-model="form.title" placeholder="需求标题" />
      </el-form-item>
      <el-form-item label="需求类型" required>
        <el-radio-group v-model="form.requirementType" :disabled="isEditingWorkflow">
          <el-radio-button value="REQUIREMENT">{{ requirementTypeLabels.REQUIREMENT }}</el-radio-button>
          <el-radio-button value="DEFECT">{{ requirementTypeLabels.DEFECT }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="分支名" required>
        <el-input
          v-model="form.branchName"
          :placeholder="branchNamePreview"
          @input="onBranchNameInput"
        />
      </el-form-item>
      <el-form-item label="涉及工程">
        <div class="project-picker">
          <el-select
            v-model="selectedProjectPaths"
            multiple
            filterable
            default-first-option
            placeholder="选择工程（从已配置的工程目录下读取）"
            style="width: 100%"
          >
            <el-option v-for="project in projectHistory" :key="project.path" :label="project.name" :value="project.path" />
          </el-select>
        </div>
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
import { DocumentAdd, Edit, Plus, Search, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { RequirementInput, RequirementType, RequirementWorkflow, RunRecord, WorkflowProject } from '@shared/workflow';
import { actionTypeLabels, defaultBranchName, requirementTypeLabels, shouldSyncBranchName, stageLabels, statusLabels } from '@shared/workflow';
import { useWorkflowStore } from '@/stores/workflow';
import { apiClient } from '@/api/client';

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
const selectedProjectPaths = ref<string[]>([]);
const projectHistory = ref<WorkflowProject[]>([]);
const editingWorkflow = ref<RequirementWorkflow>();
const isEditingWorkflow = computed(() => Boolean(editingWorkflow.value));
const dialogTitle = computed(() => (isEditingWorkflow.value ? '编辑需求' : '创建或导入需求'));
const filters = reactive<{
  keyword: string;
  requirementType: RequirementType | '';
  stage: RequirementWorkflow['currentStage'] | '';
  projectPaths: string[];
}>({
  keyword: '',
  requirementType: '',
  stage: '',
  projectPaths: []
});
const currentPage = ref(1);
const pageSize = ref(10);
const pageSizeOptions = [10, 20, 50, 100];
const requirementTypeOptions = computed(() =>
  (Object.keys(requirementTypeLabels) as RequirementType[]).map((value) => ({
    value,
    label: requirementTypeLabels[value]
  }))
);
const stageOrder: RequirementWorkflow['currentStage'][] = ['PRD', 'TECH_DESIGN', 'IMPLEMENTATION', 'CODE_REVIEW', 'DONE'];
const stageFilterOptions = computed(() => {
  const stages = new Set(store.requirements.map((workflow) => workflow.currentStage));
  return stageOrder
    .filter((stage) => stages.has(stage))
    .map((value) => ({
      value,
      label: stageText(value)
    }));
});
const projectFilterOptions = computed(() => {
  const options = new Map<string, { label: string; value: string }>();
  for (const workflow of store.requirements) {
    for (const project of workflow.projects || []) {
      const value = project.path.trim();
      if (value && !options.has(value)) {
        options.set(value, {
          value,
          label: projectDisplayName(project)
        });
      }
    }
  }
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'));
});
const filteredRequirements = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase();
  const selectedProjectPaths = new Set(filters.projectPaths);

  return store.requirements.filter((workflow) => {
    if (keyword) {
      const requirementId = workflow.requirementId.toLowerCase();
      const title = workflow.title.toLowerCase();
      if (!requirementId.includes(keyword) && !title.includes(keyword)) {
        return false;
      }
    }
    if (filters.requirementType && (workflow.requirementType || 'REQUIREMENT') !== filters.requirementType) {
      return false;
    }
    if (filters.stage && workflow.currentStage !== filters.stage) {
      return false;
    }
    if (selectedProjectPaths.size > 0 && !(workflow.projects || []).some((project) => selectedProjectPaths.has(project.path))) {
      return false;
    }
    return true;
  });
});
const hasActiveFilters = computed(() =>
  Boolean(filters.keyword.trim() || filters.requirementType || filters.stage || filters.projectPaths.length)
);
const filterSummaryText = computed(() => {
  const total = store.requirements.length;
  if (!hasActiveFilters.value) {
    return `共 ${total} 条`;
  }
  return `已筛选 ${filteredRequirements.value.length} / 共 ${total} 条`;
});
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRequirements.value.length / pageSize.value)));
const pagedRequirements = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRequirements.value.slice(start, start + pageSize.value);
});

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

watch(
  () => [form.requirementId, form.requirementType],
  () => {
    if (!isEditingWorkflow.value) {
      syncBranchName();
    }
  },
  { immediate: true }
);

function onBranchNameInput(value: string) {
  branchNameEdited.value = value.trim() !== '' && value.trim() !== lastAutoBranchName.value;
}

function stageText(stage: string) {
  return stage === 'DONE' ? '完成' : stageLabels[stage as keyof typeof stageLabels] || statusLabels[stage as keyof typeof statusLabels] || stage;
}

function stageRequirementType(requirementType: string) {
  return requirementTypeLabels[requirementType as keyof typeof requirementTypeLabels];
}

function stageTagClass(stage: RequirementWorkflow['currentStage']) {
  return ['stage-tag', `stage-tag--${stage}`];
}

function pathBasename(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || filePath;
}

function projectDisplayName(project: WorkflowProject) {
  const name = project.name?.trim();
  if (name && !name.includes('/') && !name.includes('\\')) {
    return name;
  }
  return pathBasename(name || project.path);
}

function recentRunText(run?: RunRecord) {
  if (!run) {
    return '暂无';
  }
  const actionText = actionTypeLabels[run.actionType] || run.actionType;
  const statusText = statusLabels[run.status] || run.status;
  return `${actionText}（${statusText}）`;
}

function clearFilters() {
  filters.keyword = '';
  filters.requirementType = '';
  filters.stage = '';
  filters.projectPaths = [];
}

function resetPagination() {
  currentPage.value = 1;
}

function clampCurrentPage() {
  if (currentPage.value < 1) {
    currentPage.value = 1;
    return;
  }
  if (currentPage.value > pageCount.value) {
    currentPage.value = pageCount.value;
  }
}

watch(
  () => [filters.keyword, filters.requirementType, filters.stage, filters.projectPaths.join('\u0000')],
  resetPagination
);

watch(pageSize, resetPagination);

watch([() => filteredRequirements.value.length, pageSize], clampCurrentPage);

async function loadProjectHistory() {
  // Load projects from configured projectPaths instead of saved history
  projectHistory.value = await apiClient.listProjects();
}

function openCreateDialog() {
  editingWorkflow.value = undefined;
  form.requirementId = '';
  form.title = '';
  form.requirementType = 'REQUIREMENT';
  form.branchName = '';
  selectedProjectPaths.value = [];
  branchNameEdited.value = false;
  lastAutoBranchName.value = '';
  syncBranchName();
  void loadProjectHistory();
  dialogVisible.value = true;
}

function openEditDialog(workflow: RequirementWorkflow) {
  editingWorkflow.value = workflow;
  form.requirementId = workflow.requirementId;
  form.title = workflow.title;
  form.requirementType = workflow.requirementType || 'REQUIREMENT';
  form.branchName = workflow.branchName || defaultBranchName(workflow.requirementId, form.requirementType);
  selectedProjectPaths.value = (workflow.projects || []).map((project) => project.path);
  branchNameEdited.value = true;
  lastAutoBranchName.value = defaultBranchName(workflow.requirementId, form.requirementType);
  void loadProjectHistory();
  dialogVisible.value = true;
}

function selectedProjects(): WorkflowProject[] {
  return [...new Set(selectedProjectPaths.value.map((projectPath) => projectPath.trim()).filter(Boolean))].map((projectPath) => ({
    name: projectPath.split('/').pop() || projectPath,
    path: projectPath
  }));
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
    branchName,
    projects: selectedProjects()
  });
  dialogVisible.value = false;
  await loadProjectHistory();
  if (isEditingWorkflow.value) {
    editingWorkflow.value = undefined;
    ElMessage.success('需求信息已保存');
    return;
  }
  router.push(`/requirements/${workflow.requirementId}`);
}

function openDetail(requirementId: string) {
  router.push(`/requirements/${requirementId}`);
}

onMounted(async () => {
  await Promise.all([store.loadRequirements(), loadProjectHistory()]);
});
</script>

<style scoped>
.filter-panel {
  display: grid;
  grid-template-columns: minmax(280px, 1.8fr) minmax(150px, 0.6fr) minmax(150px, 0.6fr) minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #eef2f7;
  background: linear-gradient(180deg, #fbfdff 0%, #f8fafc 100%);
}

.filter-control {
  min-width: 0;
}

.filter-control :deep(.el-input__wrapper) {
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 0 0 1px #d7dee8 inset;
  transition:
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}

.filter-control :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #9ec5fe inset, 0 8px 18px rgba(15, 23, 42, 0.04);
}

.filter-control :deep(.el-input__wrapper.is-focus) {
  background: #ffffff;
  box-shadow: 0 0 0 1px #3b82f6 inset, 0 0 0 3px rgba(59, 130, 246, 0.14);
}

.filter-control :deep(.el-input__inner) {
  color: #334155;
}

.filter-keyword :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #bfd3ee inset, 0 10px 22px rgba(15, 23, 42, 0.05);
}

.filter-keyword :deep(.el-input__prefix) {
  color: #64748b;
}

.filter-control :deep(.el-input__inner::placeholder) {
  color: #94a3b8;
}

.filter-control :deep(.el-select__tags) {
  max-width: calc(100% - 28px);
}

.filter-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 136px;
  white-space: nowrap;
}

.filter-count {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}

.clear-filter-button {
  font-weight: 600;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 16px;
  border-top: 1px solid #e5e7eb;
}

.project-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.collaboration-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.project-tag {
  max-width: 168px;
}

.project-tag :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-tag {
  border-color: var(--stage-tag-border);
  background: var(--stage-tag-bg);
  color: var(--stage-tag-color);
  font-weight: 600;
}

.stage-tag--PRD {
  --stage-tag-bg: #eff6ff;
  --stage-tag-border: #bfdbfe;
  --stage-tag-color: #1d4ed8;
}

.stage-tag--TECH_DESIGN {
  --stage-tag-bg: #fffbeb;
  --stage-tag-border: #fde68a;
  --stage-tag-color: #a16207;
}

.stage-tag--IMPLEMENTATION {
  --stage-tag-bg: #f5f3ff;
  --stage-tag-border: #ddd6fe;
  --stage-tag-color: #6d28d9;
}

.stage-tag--CODE_REVIEW {
  --stage-tag-bg: #fff1f2;
  --stage-tag-border: #fecdd3;
  --stage-tag-color: #be123c;
}

.stage-tag--DONE {
  --stage-tag-bg: #ecfdf5;
  --stage-tag-border: #a7f3d0;
  --stage-tag-color: #047857;
}

.stage-tag--SKIPPED {
  --stage-tag-bg: #f8fafc;
  --stage-tag-border: #cbd5e1;
  --stage-tag-color: #475569;
}
.stage-tag--DEFECT {
  --stage-tag-bg: #fff1f2;
  --stage-tag-border: #fecdd3;
  --stage-tag-color: #be123c;
}

.stage-tag--REQUIREMENT {
  --stage-tag-bg: #ecfdf5;
  --stage-tag-border: #a7f3d0;
  --stage-tag-color: #047857;
}

.project-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
}

@media (max-width: 720px) {
  .filter-panel {
    grid-template-columns: 1fr;
  }

  .filter-actions {
    justify-content: space-between;
    min-width: 0;
  }

  .pagination-bar {
    justify-content: flex-start;
    overflow-x: auto;
  }

  .project-picker {
    grid-template-columns: 1fr;
  }
}
</style>
