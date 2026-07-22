import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import MemoryRecallPreviewDialog from '../../src/components/MemoryRecallPreviewDialog.vue';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    previewRequirementMemoryRecall: vi.fn()
  }
}));

function stubs() {
  return {
    ElDialog: {
      props: ['modelValue', 'title'],
      emits: ['update:modelValue'],
      template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>'
    },
    ElButton: {
      props: ['loading'],
      template: '<button><slot /></button>'
    },
    ElCheckbox: {
      props: ['modelValue'],
      emits: ['update:modelValue', 'change'],
      template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'change\', $event.target.checked); $emit(\'update:modelValue\', $event.target.checked)" />'
    },
    ElAlert: { template: '<div />' },
    ElTable: { props: ['data'], template: '<div />' },
    ElTableColumn: { template: '<div />' },
    ElTag: { template: '<span><slot /></span>' },
    ElSelect: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
    },
    ElOption: { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' }
  };
}

function mountDialog() {
  return mount(MemoryRecallPreviewDialog, {
    props: {
      modelValue: true,
      requirementId: '174705',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      sourceFilePaths: ['docs/174705/prd/analysis.md'],
      clarification: '需要复用项目记忆',
      runIntent: '生成技术方案'
    },
    global: { stubs: stubs() }
  });
}

describe('MemoryRecallPreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未启用召回时直接返回 disabled payload', async () => {
    const wrapper = mountDialog();

    await (wrapper.vm as any).confirmDisabled();

    expect(wrapper.emitted('confirm')?.[0][0]).toEqual({ enabled: false });
    expect(apiClient.previewRequirementMemoryRecall).not.toHaveBeenCalled();
  });

  it('启用召回后加载候选并提交用户选择和移除原因', async () => {
    vi.mocked(apiClient.previewRequirementMemoryRecall).mockResolvedValue({
      previewId: 'recall-preview-1',
      queryProfile: {} as any,
      items: [
        {
          memoryId: 'mem-1',
          statement: '优先复用公共配置接口',
          type: 'TECH_EXPERIENCE',
          status: 'ACTIVE',
          confidence: 0.8,
          sourceSummary: '174705',
          updatedAt: '2026-07-10T00:00:00.000Z',
          score: 0.5,
          selectedByDefault: true,
          reasons: ['BM25 内容匹配'],
          scoreBreakdown: { scopeMatched: true, bm25: 1, final: 0.5 }
        },
        {
          memoryId: 'mem-2',
          statement: '旧的过期经验',
          type: 'RISK_LESSON',
          status: 'ACTIVE',
          confidence: 0.4,
          sourceSummary: '170000',
          updatedAt: '2026-07-01T00:00:00.000Z',
          score: 0.1,
          selectedByDefault: false,
          reasons: ['业务/技术实体匹配'],
          scoreBreakdown: { scopeMatched: true, keyword: 1, final: 0.1 }
        }
      ]
    });
    const wrapper = mountDialog();

    await (wrapper.vm as any).next();
    await flushPromises();
    (wrapper.vm as any).dismissedReasons['mem-2'] = 'OUTDATED';
    await (wrapper.vm as any).confirmEnabled();

    expect(apiClient.previewRequirementMemoryRecall).toHaveBeenCalledWith('174705', expect.objectContaining({
      actionType: 'DESIGN_GENERATE',
      sourceFilePaths: ['docs/174705/prd/analysis.md']
    }));
    expect(wrapper.emitted('confirm')?.[0][0]).toEqual({
      enabled: true,
      previewId: 'recall-preview-1',
      selectedMemoryIds: ['mem-1'],
      dismissed: [{ memoryId: 'mem-2', reason: 'OUTDATED' }]
    });
  });
});
