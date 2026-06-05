import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../../src/views/Settings.vue';
import { apiClient } from '@/api/client';

const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPush
  })
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    getSettings: vi.fn(),
    saveSettings: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    }
  };
});

function stubs() {
  return {
    ElButton: {
      props: ['icon', 'loading', 'type'],
      template: '<button :disabled="loading" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ElTabs: {
      props: ['modelValue'],
      template: '<div><slot /></div>'
    },
    ElTabPane: {
      props: ['label', 'name'],
      template: '<section><slot /></section>'
    },
    ElCard: {
      template: '<section><header><slot name="header" /></header><slot /></section>'
    },
    ElForm: {
      template: '<form><slot /></form>'
    },
    ElFormItem: {
      props: ['label'],
      template: '<label><span>{{ label }}</span><slot /></label>'
    },
    ElInput: {
      props: ['modelValue', 'placeholder'],
      emits: ['update:modelValue'],
      template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    },
    ElRadioGroup: {
      template: '<div><slot /></div>'
    },
    ElRadioButton: {
      props: ['label'],
      template: '<button type="button"><slot />{{ label }}</button>'
    },
    ElSelect: {
      props: ['modelValue'],
      template: '<select><slot /></select>'
    },
    ElOption: {
      props: ['label', 'value'],
      template: '<option :value="value">{{ label }}</option>'
    },
    ElTable: {
      props: ['data'],
      template: '<div><slot /></div>'
    },
    ElTableColumn: {
      template: '<div><slot name="default" :row="{}" :$index="0" /></div>'
    },
    ElSwitch: {
      template: '<input type="checkbox" />'
    },
    ElTag: {
      template: '<span><slot /></span>'
    },
    ElAlert: {
      template: '<div />'
    },
    ElEmpty: {
      template: '<div />'
    }
  };
}

describe('Settings', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routerPush.mockReset();
    vi.mocked(apiClient.getSettings).mockResolvedValue({ projectPaths: ['/Users/me/work'] });
    vi.mocked(apiClient.saveSettings).mockResolvedValue({ projectPaths: ['/Users/me/work'] });
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) || null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear()
      }
    });
    delete window.aiDeliveryDesktop;
  });

  it('支持从个人中心返回需求列表', async () => {
    const wrapper = mount(Settings, {
      global: {
        plugins: [createPinia()],
        stubs: stubs()
      }
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text().includes('返回列表'))?.trigger('click');

    expect(routerPush).toHaveBeenCalledWith({ name: 'requirements' });
  });
});
