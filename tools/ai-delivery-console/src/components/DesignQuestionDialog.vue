<template>
  <el-dialog v-model="visible" title="技术方案答疑" width="760px" destroy-on-close class="design-question-dialog">
    <section class="question-history-panel" aria-label="历史提问">
      <div class="dialog-section-heading">
        <strong>历史提问</strong>
        <span class="muted">{{ items.length ? `${items.length} 条` : '暂无记录' }}</span>
      </div>
      <div v-if="loading" class="question-loading">读取答疑记录中...</div>
      <el-empty v-else-if="!items.length" description="暂无提问记录" />
      <div v-else class="question-history-list">
        <article
          v-for="item in visibleItems"
          :key="item.id"
          class="question-history-item"
          :class="{ active: selectedItemId === item.id }"
          @click="selectItem(item)"
        >
          <div class="question-history-main">
            <span>{{ formatTime(item.time) }}</span>
            <strong>{{ item.summary || '未记录问题' }}</strong>
          </div>
          <span class="question-status" :class="statusClass(item.status)">{{ statusText(item.status) }}</span>
          <el-button v-if="item.answer" link @click.stop="selectItem(item)">{{ selectedItemId === item.id ? '收起答案' : '查看答案' }}</el-button>
          <el-button v-else-if="item.runId" link @click.stop="openProgress(item)">查看进度</el-button>
          <el-button type="danger" link :icon="Delete" @click.stop="deleteItem(item)">删除</el-button>
        </article>
      </div>
      <article v-if="selectedItem" class="selected-question">
        <strong>问题</strong>
        <p>{{ selectedItem.question }}</p>
      </article>
      <article v-if="selectedAnswer" class="answer-panel">
        <div class="answer-section">
          <strong>回答</strong>
          <p>{{ selectedAnswer.answer || '暂无回答内容' }}</p>
        </div>
        <div class="answer-section">
          <strong>依据</strong>
          <p>{{ selectedAnswer.evidence || '暂无依据' }}</p>
        </div>
        <div class="answer-section">
          <strong>后续建议</strong>
          <p>{{ selectedAnswer.suggestions || '暂无' }}</p>
        </div>
      </article>
    </section>

    <section class="new-question-panel" aria-label="新问题">
      <div class="dialog-section-heading">
        <strong>新问题</strong>
        <span class="muted">{{ question.length }} / 2000</span>
      </div>
      <el-input
        v-model="question"
        class="design-question-dialog-input"
        type="textarea"
        :rows="4"
        maxlength="2000"
        show-word-limit
        placeholder="输入你对技术方案的疑问"
      />
    </section>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :disabled="!canSubmit" :icon="ChatLineSquare" @click="submit">{{ submitLabel }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChatLineSquare, Delete } from '@element-plus/icons-vue';
import type { TechDesignQuestionDisplayStatus, TechDesignQuestionListItem } from '@/utils/tech-design-questions';

const props = defineProps<{
  loading: boolean;
  items: TechDesignQuestionListItem[];
  submitLabel: string;
}>();

const emit = defineEmits<{
  (event: 'submit', question: string): void;
  (event: 'progress', runId: string): void;
  (event: 'delete', item: TechDesignQuestionListItem): void;
  (event: 'open'): void;
}>();

const visible = ref(false);
const question = ref('');
const selectedItemId = ref('');

const visibleItems = computed(() => [...props.items].sort((left, right) => itemTimestamp(right.time) - itemTimestamp(left.time)));
const selectedItem = computed(() => props.items.find((item) => item.id === selectedItemId.value));
const selectedAnswer = computed(() => selectedItem.value?.answer);
const canSubmit = computed(() => Boolean(question.value.trim()));

watch(
  () => props.items,
  (items) => {
    if (!items.some((item) => item.id === selectedItemId.value)) {
      selectedItemId.value = '';
    }
  },
  { immediate: true }
);

function open() {
  visible.value = true;
  emit('open');
}

function clearQuestion() {
  question.value = '';
}

function itemTimestamp(time: string) {
  const timestamp = Date.parse(time || '');
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatTime(time: string) {
  if (!time) {
    return '未记录时间';
  }
  const timestamp = Date.parse(time);
  if (Number.isNaN(timestamp)) {
    return time;
  }
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusText(status: TechDesignQuestionDisplayStatus) {
  const labels: Record<TechDesignQuestionDisplayStatus, string> = {
    ANSWERED: '已回答',
    PENDING_RECORD: '待记录',
    QUEUED: '排队中',
    RUNNING: '回答中',
    TERMINAL_OPENED: '终端已打开',
    SUCCEEDED: '已完成',
    COMPLETED: '已完成',
    FAILED: '失败',
    CANCELLED: '已取消',
    WAITING_FOR_AGENT: '等待 Agent'
  };
  return labels[status] || status;
}

function statusClass(status: TechDesignQuestionDisplayStatus) {
  if (status === 'ANSWERED' || status === 'SUCCEEDED' || status === 'COMPLETED') {
    return 'done';
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return 'error';
  }
  if (status === 'PENDING_RECORD') {
    return 'pending';
  }
  return 'running';
}

function selectItem(item: TechDesignQuestionListItem) {
  selectedItemId.value = selectedItemId.value === item.id ? '' : item.id;
}

function openProgress(item: TechDesignQuestionListItem) {
  if (item.runId) {
    emit('progress', item.runId);
  }
}

function deleteItem(item: TechDesignQuestionListItem) {
  emit('delete', item);
}

function submit() {
  const nextQuestion = question.value.trim();
  if (!nextQuestion) {
    return;
  }
  emit('submit', nextQuestion);
}

defineExpose({ clearQuestion, open });
</script>

<style scoped>
.question-history-panel,
.new-question-panel {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  min-width: 0;
}

.dialog-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.dialog-section-heading strong {
  color: #172033;
  font-size: 14px;
}

.question-loading {
  min-height: 88px;
  padding: 28px 12px;
  border: 1px dashed #dbe3ef;
  border-radius: 8px;
  color: #64748b;
  text-align: center;
}

.question-history-list {
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}

.question-history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  text-align: left;
}

.question-history-item.active {
  border-color: #60a5fa;
  background: #eff6ff;
}

.question-history-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.question-history-main span {
  color: #64748b;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.question-history-main strong {
  min-width: 0;
  color: #172033;
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.question-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
}

.question-status.done {
  color: #047857;
  background: #dcfce7;
}

.question-status.running {
  color: #1d4ed8;
  background: #dbeafe;
}

.question-status.pending {
  color: #b45309;
  background: #fef3c7;
}

.question-status.error {
  color: #b91c1c;
  background: #fee2e2;
}

.selected-question {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #f8fbff;
}

.selected-question strong {
  color: #1d4ed8;
  font-size: 13px;
}

.selected-question p {
  margin: 0;
  color: #334155;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.answer-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #ffffff;
}

.answer-section {
  display: grid;
  gap: 6px;
}

.answer-section strong {
  color: #172033;
  font-size: 13px;
}

.answer-section p {
  margin: 0;
  color: #334155;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.design-question-dialog-input :deep(.el-textarea__inner) {
  min-height: 100px !important;
  border-radius: 8px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .question-history-item {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
</style>
