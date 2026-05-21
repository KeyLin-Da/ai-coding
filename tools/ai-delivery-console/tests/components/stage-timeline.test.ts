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
  it('展示四阶段和阶段状态', () => {
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
});
