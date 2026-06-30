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

  it('终端日志过滤结构化 Token 明细事件', async () => {
    const wrapper = mount(RunLogDrawer, {
      props: {
        events: [
          {
            time: '2026-06-22T10:20:00.000Z',
            type: 'INFO',
            level: 'INFO',
            message: 'Token usage',
            text: '{"type":"token_count"}',
            data: {
              kind: 'TOKEN_USAGE',
              usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 }
            }
          },
          {
            time: '2026-06-22T10:21:00.000Z',
            type: 'STDOUT',
            level: 'INFO',
            message: '正常运行日志'
          }
        ]
      },
      global: {
        stubs: {
          ElDrawer: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot name="header" /><slot /></div>'
          },
          ElButton: { template: '<button><slot /></button>' },
          ElEmpty: { template: '<div />' }
        }
      }
    });

    (wrapper.vm as any).open();
    await nextTick();

    expect(wrapper.text()).toContain('正常运行日志');
    expect(wrapper.text()).not.toContain('{"type":"token_count"}');
    expect((wrapper.vm as any).terminalEvents).toHaveLength(1);
  });

  it('合并连续 stdout 输出，避免每段输出单独滚动', async () => {
    const wrapper = mount(RunLogDrawer, {
      props: {
        events: [
          {
            time: '2026-06-22T10:21:00.000Z',
            type: 'STDOUT',
            level: 'INFO',
            message: '第一段',
            data: { transcriptPath: 'run.terminal.log' }
          },
          {
            time: '2026-06-22T10:21:01.000Z',
            type: 'STDOUT',
            level: 'INFO',
            message: '第二段',
            data: { transcriptPath: 'run.terminal.log' }
          },
          {
            time: '2026-06-22T10:21:02.000Z',
            type: 'WARN',
            level: 'WARN',
            message: '警告日志'
          }
        ]
      },
      global: {
        stubs: {
          ElDrawer: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot name="header" /><slot /></div>'
          },
          ElButton: { template: '<button><slot /></button>' },
          ElEmpty: { template: '<div />' }
        }
      }
    });

    (wrapper.vm as any).open();
    await nextTick();

    expect((wrapper.vm as any).terminalEvents).toHaveLength(3);
    expect((wrapper.vm as any).displayTerminalEvents).toHaveLength(2);
    expect((wrapper.vm as any).displayTerminalEvents[0]).toMatchObject({
      type: 'STDOUT',
      count: 2,
      text: '第一段\n第二段'
    });
  });

  it('支持按关键词和级别过滤可见日志', async () => {
    const wrapper = mount(RunLogDrawer, {
      props: {
        events: [
          {
            time: '2026-06-22T10:21:00.000Z',
            type: 'STDOUT',
            level: 'INFO',
            message: '构建成功'
          },
          {
            time: '2026-06-22T10:21:01.000Z',
            type: 'STDERR',
            level: 'ERROR',
            message: 'needle 编译失败'
          }
        ]
      },
      global: {
        stubs: {
          ElDrawer: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot name="header" /><slot /></div>'
          },
          ElButton: { template: '<button><slot /></button>' },
          ElEmpty: { template: '<div />' }
        }
      }
    });

    (wrapper.vm as any).open();
    await nextTick();

    (wrapper.vm as any).searchKeyword = 'needle';
    await nextTick();
    expect((wrapper.vm as any).displayTerminalEvents).toHaveLength(1);
    expect((wrapper.vm as any).displayTerminalEvents[0].text).toContain('编译失败');

    (wrapper.vm as any).levelFilter = 'INFO';
    await nextTick();
    expect((wrapper.vm as any).displayTerminalEvents).toHaveLength(0);
  });

  it('将 Codex JSONL 日志格式化为可读命令和正文', async () => {
    const wrapper = mount(RunLogDrawer, {
      props: {
        events: [
          {
            time: '2026-06-30T10:21:00.000Z',
            type: 'STDOUT',
            level: 'INFO',
            message: '{"type":"item.completed"}',
            text: [
              JSON.stringify({
                type: 'item.started',
                item: {
                  id: 'item_1',
                  type: 'command_execution',
                  command: '/bin/zsh -lc "sed -n 1,20p file.md"',
                  status: 'in_progress'
                }
              }),
              JSON.stringify({
                type: 'item.completed',
                item: {
                  id: 'item_1',
                  type: 'command_execution',
                  command: '/bin/zsh -lc "sed -n 1,20p file.md"',
                  aggregated_output: '# 标题\\n\\n## 小节\\n正文',
                  exit_code: 0,
                  status: 'completed'
                }
              })
            ].join('\n')
          }
        ]
      },
      global: {
        stubs: {
          ElDrawer: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot name="header" /><slot /></div>'
          },
          ElButton: { template: '<button><slot /></button>' },
          ElEmpty: { template: '<div />' }
        }
      }
    });

    (wrapper.vm as any).open();
    await nextTick();

    const [event] = (wrapper.vm as any).displayTerminalEvents;
    expect(event.title).toBe('command_execution');
    expect(event.command).toBe('/bin/zsh -lc "sed -n 1,20p file.md"');
    expect(event.text).toContain('COMPLETED command_execution · item_1 · exit 0');
    expect(event.text).toContain('# 标题\n\n## 小节\n正文');
    expect(event.text).not.toContain('aggregated_output');
    expect(wrapper.text()).toContain('$ /bin/zsh -lc "sed -n 1,20p file.md"');
  });
});
