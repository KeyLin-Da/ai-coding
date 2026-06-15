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
          }
        }
      }
    });

    (wrapper.vm as any).open();
    await nextTick();

    expect(wrapper.text()).toContain('summary');
    expect(wrapper.text()).toContain('truncated 900');
  });
});
