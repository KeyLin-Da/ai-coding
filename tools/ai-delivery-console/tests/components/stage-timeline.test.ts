import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import StageTimeline from '../../src/components/StageTimeline.vue';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  const stages = createEmptyStages();
  stages.PRD.status = 'APPROVED';
  return {
    requirementId: '172014',
    title: '测试',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages,
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('StageTimeline', () => {
  it('展示五阶段和阶段状态', () => {
    const wrapper = mount(StageTimeline, {
      props: {
        workflow: workflow(),
        modelValue: 'TECH_DESIGN'
      }
    });
    expect(wrapper.text()).toContain('PRD');
    expect(wrapper.text()).toContain('技术方案');
    expect(wrapper.text()).toContain('已通过');
  });

  it('点击阶段时触发更新事件', async () => {
    const wrapper = mount(StageTimeline, {
      props: {
        workflow: workflow(),
        modelValue: 'TECH_DESIGN'
      }
    });
    await wrapper.findAll('button')[2].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['IMPLEMENTATION']);
  });

  it('缺陷工作流不展示 PRD 且阶段序号从技术方案开始', () => {
    const item = {
      ...workflow(),
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT')
    };
    const wrapper = mount(StageTimeline, {
      props: {
        workflow: item,
        modelValue: 'TECH_DESIGN'
      }
    });

    expect(wrapper.text()).not.toContain('PRD');
    expect(wrapper.findAll('button')).toHaveLength(4);
    expect(wrapper.find('.step-index').text()).toBe('1');
    expect(wrapper.find('button').text()).toContain('技术方案');
  });

  it('旧 workflow 缺少新增阶段状态时仍可渲染为未开始', () => {
    const item = workflow();
    const legacyStages = { ...item.stages };
    delete (legacyStages as Partial<typeof legacyStages>).RETROSPECTIVE;
    const wrapper = mount(StageTimeline, {
      props: {
        workflow: {
          ...item,
          stages: legacyStages as RequirementWorkflow['stages']
        },
        modelValue: 'TECH_DESIGN'
      }
    });

    expect(wrapper.text()).toContain('交付复盘');
    expect(wrapper.text()).toContain('未开始');
  });
});
