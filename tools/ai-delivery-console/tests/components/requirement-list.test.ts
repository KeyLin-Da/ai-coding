import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import RequirementList from '../../src/views/RequirementList.vue';
import { apiClient } from '@/api/client';
import { ElMessage } from 'element-plus';

const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPush
  })
}));

vi.mock('@/api/client', () => ({
	  apiClient: {
	    listRequirements: vi.fn(),
	    listProjectHistory: vi.fn(),
	    listProjects: vi.fn(),
	    createRequirement: vi.fn()
	  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn()
    }
  };
});

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '旧标题',
    requirementType: 'REQUIREMENT',
    branchName: 'feature/opp-172014',
    projects: [
      {
        name: 'opp-api',
        path: 'opp-api'
      }
    ],
    sources: [],
    currentStage: 'PRD',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

function componentStubs() {
  return {
    ElButton: {
      props: ['disabled'],
      template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ElDialog: {
      props: ['title'],
      template: '<section><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>'
    },
    ElForm: { template: '<form><slot /></form>' },
    ElFormItem: {
      props: ['label'],
      template: '<label><span>{{ label }}</span><slot /></label>'
    },
    ElInput: {
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue', 'input'],
      template:
        '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)" />'
    },
    ElOption: {
      props: ['label', 'value'],
      template: '<option :value="value">{{ label }}</option>'
    },
    ElRadioButton: {
      props: ['value'],
      template: '<button type="button" :value="value"><slot /></button>'
    },
    ElRadioGroup: {
      props: ['modelValue', 'disabled'],
      template: '<div :data-disabled="disabled"><slot /></div>'
    },
    ElSelect: {
      template: '<select multiple><slot /></select>'
    },
    ElTable: { template: '<div><slot /></div>' },
    ElTableColumn: { template: '<div />' },
    ElTag: { template: '<span><slot /></span>' }
  };
}

async function mountList(current = workflow()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.mocked(apiClient.listRequirements).mockResolvedValue([current]);
  vi.mocked(apiClient.listProjectHistory).mockResolvedValue([
    {
      name: 'opp-api',
      path: 'opp-api'
    },
    {
      name: 'opp-diy',
      path: 'opp-diy'
    }
  ]);
  vi.mocked(apiClient.listProjects).mockResolvedValue([
    {
      name: 'opp-api',
      path: 'opp-api'
    },
    {
      name: 'opp-diy',
      path: 'opp-diy'
    }
  ]);
  vi.mocked(apiClient.createRequirement).mockResolvedValue({
    ...current,
    title: '新标题',
    branchName: 'feature/opp-172014-edit',
    projects: [
      {
        name: 'opp-api',
        path: 'opp-api'
      },
      {
        name: 'opp-diy',
        path: 'opp-diy'
      }
    ]
  });

  const wrapper = mount(RequirementList, {
    global: {
      plugins: [pinia],
      stubs: componentStubs()
    }
  });
  await flushPromises();
  return wrapper;
}

describe('RequirementList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('编辑已有需求时允许修改标题和分支名并保留需求号锁定', async () => {
    const current = workflow();
    const wrapper = await mountList(current);

    (wrapper.vm as any).openEditDialog(current);
    await flushPromises();

    const inputs = wrapper.findAll('input');
    expect(wrapper.text()).toContain('编辑需求');
    expect(inputs[0].attributes('disabled')).toBeDefined();
    expect(inputs[1].attributes('disabled')).toBeUndefined();
    expect(inputs[2].attributes('disabled')).toBeUndefined();

    await inputs[1].setValue('新标题');
    await inputs[2].setValue('feature/opp-172014-edit');
    await (wrapper.vm as any).submit();

    expect(apiClient.createRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: '172014',
        title: '新标题',
        branchName: 'feature/opp-172014-edit',
        projects: [{ name: 'opp-api', path: 'opp-api' }]
      })
    );
    expect(routerPush).not.toHaveBeenCalled();
    expect(ElMessage.success).toHaveBeenCalledWith('需求信息已保存');
  });
});
