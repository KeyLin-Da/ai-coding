<template>
  <el-dialog v-model="visible" title="技术方案答疑" fullscreen destroy-on-close class="design-question-dialog">
    <div class="design-question-workspace">
      <aside class="question-history-panel" aria-label="历史提问">
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
            <div class="question-history-actions">
              <el-button v-if="item.answer" link @click.stop="selectItem(item)">
                {{ selectedItemId === item.id ? '收起答案' : '查看答案' }}
              </el-button>
              <el-button v-else-if="item.runId" link @click.stop="openProgress(item)">查看进度</el-button>
              <el-button type="danger" link :icon="Delete" @click.stop="deleteItem(item)">删除</el-button>
            </div>
          </article>
        </div>

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
      </aside>

      <main class="answer-detail-panel" aria-label="回答预览">
        <el-empty v-if="!selectedItem" description="选择左侧问题查看回答" />
        <template v-else>
          <header class="answer-detail-header">
            <div class="answer-detail-title">
              <span>{{ formatTime(selectedItem.time) }}</span>
              <h3>{{ selectedItem.summary || '未记录问题' }}</h3>
            </div>
            <span class="question-status" :class="statusClass(selectedItem.status)">{{ statusText(selectedItem.status) }}</span>
          </header>

          <article class="selected-question">
            <strong>问题</strong>
            <p>{{ selectedItem.question }}</p>
          </article>

          <article v-if="selectedAnswer" class="answer-panel">
            <section class="answer-section answer-section--answer">
              <strong>回答</strong>
              <div v-if="selectedAnswerHtml.answer" class="answer-markdown" v-html="selectedAnswerHtml.answer"></div>
              <p v-else>暂无回答内容</p>
            </section>
            <section class="answer-section">
              <strong>依据</strong>
              <div v-if="selectedAnswerHtml.evidence" class="answer-markdown" v-html="selectedAnswerHtml.evidence"></div>
              <p v-else>暂无依据</p>
            </section>
            <section class="answer-section">
              <strong>后续建议</strong>
              <div v-if="selectedAnswerHtml.suggestions" class="answer-markdown" v-html="selectedAnswerHtml.suggestions"></div>
              <p v-else>暂无</p>
            </section>
          </article>
          <article v-else class="answer-panel answer-panel--empty">
            <p>当前问题还没有可预览的回答。</p>
            <el-button v-if="selectedItem.runId" link @click="openProgress(selectedItem)">查看进度</el-button>
          </article>
        </template>
      </main>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :disabled="!canSubmit" :icon="ChatLineSquare" @click="submit">{{ submitLabel }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import { ChatLineSquare, Delete } from '@element-plus/icons-vue';
import type { TechDesignQuestionDisplayStatus, TechDesignQuestionListItem } from '@/utils/tech-design-questions';
import { artifactMarkdownRenderCache, renderMarkdownSafely } from '@/utils/artifact-preview-rendering';

const markdownRendererVersion = 'design-question-answer-v2';
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

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
const selectedAnswerHtml = computed(() => ({
  answer: renderAnswerMarkdown(selectedAnswer.value?.answer || ''),
  evidence: renderAnswerMarkdown(selectedAnswer.value?.evidence || ''),
  suggestions: renderAnswerMarkdown(selectedAnswer.value?.suggestions || '')
}));
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

function renderAnswerMarkdown(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return '';
  }
  return renderMarkdownSafely({
    content: trimmed,
    rendererVersion: markdownRendererVersion,
    cache: artifactMarkdownRenderCache,
    render: (value) => md.render(value)
  }).html;
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
:global(.design-question-dialog.el-dialog) {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}

:global(.design-question-dialog .el-dialog__body) {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: #f8fafc;
}

:global(.design-question-dialog .el-dialog__footer) {
  flex: 0 0 auto;
  padding: 12px 20px;
  border-top: 1px solid #e5eaf3;
  background: #ffffff;
}

.design-question-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.question-history-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 18px;
  border-right: 1px solid #e5eaf3;
  background: #ffffff;
  overflow: hidden;
}

.new-question-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding-top: 14px;
  border-top: 1px solid #edf2f7;
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
  align-content: start;
  gap: 8px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.question-history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.question-history-item:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
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

.question-history-actions {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  gap: 4px 10px;
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

.answer-detail-panel {
  min-width: 0;
  min-height: 0;
  padding: 24px 28px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.answer-detail-panel :deep(.el-empty) {
  min-height: 60vh;
}

.answer-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.answer-detail-title {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.answer-detail-title span {
  color: #64748b;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.answer-detail-title h3 {
  margin: 0;
  color: #172033;
  font-size: 20px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.selected-question {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
  padding: 14px 16px;
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
  gap: 16px;
  padding: 18px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #ffffff;
}

.answer-panel--empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #64748b;
}

.answer-section {
  display: grid;
  gap: 10px;
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

.answer-markdown {
  min-width: 0;
  color: #334155;
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.answer-markdown :deep(h1),
.answer-markdown :deep(h2),
.answer-markdown :deep(h3),
.answer-markdown :deep(h4) {
  margin: 18px 0 10px;
  color: #172033;
  line-height: 1.35;
}

.answer-markdown :deep(h1:first-child),
.answer-markdown :deep(h2:first-child),
.answer-markdown :deep(h3:first-child),
.answer-markdown :deep(h4:first-child),
.answer-markdown :deep(p:first-child),
.answer-markdown :deep(ul:first-child),
.answer-markdown :deep(ol:first-child) {
  margin-top: 0;
}

.answer-markdown :deep(p) {
  margin: 0 0 12px;
}

.answer-markdown :deep(ul),
.answer-markdown :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}

.answer-markdown :deep(li + li) {
  margin-top: 4px;
}

.answer-markdown :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  background: #eef2f7;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.92em;
}

.answer-markdown :deep(pre) {
  margin: 0 0 14px;
  padding: 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #e5e7eb;
  overflow: auto;
}

.answer-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
}

.answer-markdown :deep(blockquote) {
  margin: 0 0 14px;
  padding: 8px 12px;
  border-left: 3px solid #93c5fd;
  background: #eff6ff;
  color: #475569;
}

.answer-markdown :deep(table) {
  width: 100%;
  margin: 0 0 14px;
  border-collapse: collapse;
  font-size: 13px;
}

.answer-markdown :deep(th),
.answer-markdown :deep(td) {
  padding: 8px 10px;
  border: 1px solid #dbe3ef;
  text-align: left;
}

.answer-markdown :deep(th) {
  background: #f1f5f9;
  color: #172033;
}

.design-question-dialog-input :deep(.el-textarea__inner) {
  min-height: 100px !important;
  border-radius: 8px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .design-question-workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(260px, 42vh) minmax(0, 1fr);
  }

  .question-history-panel {
    border-right: 0;
    border-bottom: 1px solid #e5eaf3;
  }
}

@media (max-width: 760px) {
  .question-history-item {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .answer-detail-panel {
    padding: 18px;
  }

  .answer-detail-header {
    display: grid;
  }
}
</style>
