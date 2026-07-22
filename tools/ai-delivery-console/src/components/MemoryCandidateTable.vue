<template>
  <el-table v-loading="loading" :data="items" style="width: 100%">
    <el-table-column label="候选经验" min-width="340">
      <template #default="{ row }">
        <div class="memory-statement">
          <strong>{{ row.statement }}</strong>
          <p class="muted">{{ row.sourceText }}</p>
          <div class="tag-line">
            <el-tag size="small" :type="row.status === 'PENDING_VERIFY' ? 'warning' : 'info'" effect="plain">{{ statusText(row.status) }}</el-tag>
            <el-tag v-for="tag in row.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column v-if="showSource" label="来源" min-width="200">
      <template #default="{ row }">
        <span>{{ row.requirementId }} · {{ row.sourceType }}</span>
        <p class="muted">{{ row.sourceRunId }}</p>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="420" fixed="right">
      <template #default="{ row }">
        <el-button size="small" type="primary" @click="$emit('confirm', row)">确认沉淀</el-button>
        <el-button size="small" @click="$emit('edit', row)">编辑</el-button>
        <el-button size="small" @click="$emit('pending', row)">待验证</el-button>
        <el-button size="small" @click="$emit('local', row)">仅本需求</el-button>
        <el-button size="small" @click="$emit('ignore', row)">忽略</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import type { MemoryCandidate } from '@shared/memory';

defineProps<{
  items: MemoryCandidate[];
  loading?: boolean;
  showSource?: boolean;
}>();

defineEmits<{
  (event: 'confirm', value: MemoryCandidate): void;
  (event: 'edit', value: MemoryCandidate): void;
  (event: 'pending', value: MemoryCandidate): void;
  (event: 'local', value: MemoryCandidate): void;
  (event: 'ignore', value: MemoryCandidate): void;
}>();

function statusText(status: string): string {
  const map: Record<string, string> = {
    PENDING_CONFIRM: '待确认',
    PENDING_VERIFY: '待验证',
    LOCAL_ONLY: '仅本需求',
    IGNORED: '已忽略',
    CONFIRMED: '已沉淀'
  };
  return map[status] || status;
}
</script>

<style scoped>
.memory-statement {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tag-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.muted {
  margin: 0;
  color: #718096;
  font-size: 13px;
}
</style>
