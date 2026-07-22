<template>
  <section class="supplement-summary" :class="{ 'has-content': hasContent }" aria-label="补充输入摘要">
    <div class="supplement-summary-main">
      <strong>{{ title }}</strong>
      <p>{{ summaryText }}</p>
    </div>
    <el-button :disabled="disabled" @click="$emit('edit')">{{ buttonText }}</el-button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SupplementBlock } from '@shared/workflow';
import { buildSupplementBlocks, type SupplementFileLike } from '@/utils/supplement-composer';

const props = withDefaults(
  defineProps<{
    title?: string;
    text?: string;
    blocks?: SupplementBlock[];
    files?: SupplementFileLike[];
    disabled?: boolean;
  }>(),
  {
    title: '补充输入',
    text: '',
    blocks: undefined,
    files: () => [],
    disabled: false
  }
);

defineEmits<{
  (event: 'edit'): void;
}>();

const summaryBlocks = computed(() => buildSupplementBlocks({ blocks: props.blocks, text: props.text, files: props.files }));
const paragraphCount = computed(() => summaryBlocks.value.filter((block) => block.type === 'PARAGRAPH').length);
const imageCount = computed(() => summaryBlocks.value.filter((block) => block.type === 'IMAGE').length);
const regularFileCount = computed(() => summaryBlocks.value.filter((block) => block.type === 'FILE').length);
const hasContent = computed(() => Boolean(summaryBlocks.value.length));
const buttonText = computed(() => (hasContent.value ? '编辑补充输入' : '添加补充输入'));
const summaryText = computed(() => {
  if (!hasContent.value) {
    return '可补充文本、截图、设计稿或文件，将纳入下一次生成。';
  }
  const parts: string[] = [];
  if (paragraphCount.value) {
    parts.push(`说明 ${paragraphCount.value} 段`);
  }
  if (imageCount.value) {
    parts.push(`图片 ${imageCount.value} 张`);
  }
  if (regularFileCount.value) {
    parts.push(`文件 ${regularFileCount.value} 个`);
  }
  return `${parts.join(' · ')}，将纳入下一次生成。`;
});
</script>

<style scoped>
.supplement-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #f8fbff;
}

.supplement-summary.has-content {
  border-color: #c7d2fe;
  background: #eef2ff;
}

.supplement-summary-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.supplement-summary-main strong {
  color: #172033;
  font-size: 14px;
  line-height: 22px;
}

.supplement-summary-main p {
  margin: 0;
  color: #64748b;
  line-height: 20px;
}

@media (max-width: 760px) {
  .supplement-summary {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
