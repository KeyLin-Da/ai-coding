import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import RunLogDrawer from '../../src/components/RunLogDrawer.vue';

describe('RunLogDrawer', () => {
  it('展示长日志截断信息', async () => {
    const wrapper = mount(RunLogDrawer, {
      props: {
        events: [
          {
            time: '2026-06-05T13:00:00.000Z',
            type: 'STDOUT',
            level: 'INFO',
            message: 'summary',
            data: {
              truncated: true,
              originalLength: 900
            }
          }
        ]
      },
      global: {
        stubs: {
          ElDrawer: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot name="header" /><slot /></div>'
          },
          ElButton: {
            template: '<button><slot /></button>'
          },
          ElEmpty: {
            template: '<div />'
          },
          ElTable: {
            template: '<div><slot /></div>'
          },
          ElTableColumn: {
            template: '<div><slot :row="{ inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningOutputTokens: 1, totalTokens: 12 }" /></div>'
          }
        }
      }
    });

    (wrapper.vm as any).open();
    await nextTick();

    expect(wrapper.text()).toContain('summary');
    expect(wrapper.text()).toContain('truncated 900');
  });

  it('展示 run token usage 汇总和明细', async () => {
    const wrapper = mount(RunLogDrawer, {
      props: {
        events: [
          {
            time: '2026-06-22T10:20:00.000Z',
            type: 'INFO',
            level: 'INFO',
            message: 'Token usage'
          }
        ],
        usage: {
          runId: 100,
          summary: {
            runId: 100,
            totalTokens: 12,
            inputTokens: 10,
            cachedInputTokens: 4,
            outputTokens: 2,
            reasoningOutputTokens: 1,
            runCount: 1,
            detailCount: 1
          },
          details: [
            {
              id: 1,
              runId: 100,
              sourceEventType: 'turn.completed',
              model: 'gpt-5',
              inputTokens: 10,
              cachedInputTokens: 4,
              outputTokens: 2,
              reasoningOutputTokens: 1,
              totalTokens: 12
            }
          ]
        }
      },
      global: {
        stubs: {
          ElDrawer: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot name="header" /><slot /></div>'
          },
          ElButton: {
            template: '<button><slot /></button>'
          },
          ElEmpty: {
            template: '<div />'
          },
          ElTable: {
            template: '<div><slot /></div>'
          },
          ElTableColumn: {
            template: '<div><slot :row="{ inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningOutputTokens: 1, totalTokens: 12 }" /></div>'
          }
        }
      }
    });

    (wrapper.vm as any).open();
    await nextTick();

    expect(wrapper.text()).toContain('本次 Token');
    expect(wrapper.text()).toContain('明细 1 条');
    expect((wrapper.vm as any).displayUsage.details[0]).toMatchObject({
      sourceEventType: 'turn.completed',
      model: 'gpt-5'
    });
  });
});
