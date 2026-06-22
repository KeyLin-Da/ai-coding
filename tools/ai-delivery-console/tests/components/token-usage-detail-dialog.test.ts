import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TokenUsageDetailDialog from '../../src/components/TokenUsageDetailDialog.vue';
import { apiClient } from '../../src/api/client';

describe('TokenUsageDetailDialog', () => {
  it('打开后分页加载需求明细且不重复展示统计卡片', async () => {
    const detailsSpy = vi.spyOn(apiClient, 'getRequirementTokenUsageDetails').mockResolvedValue({
      requirementPk: 100,
      page: 1,
      pageSize: 20,
      total: 21,
      items: [
        {
          id: 1,
          runId: 900,
          stage: 'TECH_DESIGN',
          agentId: 'codex',
          model: 'gpt-5.5',
          sourceEventType: 'token_count',
          inputTokens: 10,
          cachedInputTokens: 4,
          outputTokens: 2,
          reasoningOutputTokens: 1,
          totalTokens: 12,
          occurredAt: '2026-06-22T10:20:00'
        }
      ]
    });
    const wrapper = mount(TokenUsageDetailDialog, {
      props: { requirementPk: 100 },
      global: {
        directives: { loading: () => undefined },
        stubs: {
          ElDialog: {
            props: ['modelValue', 'title'],
            template: '<div v-if="modelValue"><h2>{{ title }}</h2><slot /></div>'
          },
          ElAlert: { template: '<div><slot /></div>' },
          ElTable: { props: ['data'], template: '<div class="table">{{ data.length }} 条数据<slot /></div>' },
          ElTableColumn: { template: '<div />' },
          ElPagination: { props: ['total'], template: '<div class="pagination">共 {{ total }} 条</div>' }
        }
      }
    });

    await (wrapper.vm as any).open();
    await flushPromises();

    expect(detailsSpy).toHaveBeenCalledWith(100, 1, 20);
    expect(wrapper.text()).toContain('Token 使用明细');
    expect(wrapper.text()).toContain('共 21 条');
    expect(wrapper.text()).not.toContain('累计 Token');
    expect((wrapper.vm as any).pageData.items[0]).toMatchObject({ runId: 900, model: 'gpt-5.5' });
  });
});
