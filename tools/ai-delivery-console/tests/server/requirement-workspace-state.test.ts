import { describe, expect, it, vi } from 'vitest';
import { createEmptyStages, type RequirementWorkflow } from '../../shared/workflow';
import { scheduleRequirementWorkspaceStateReport } from '../../server/services/requirement-workspace-state';

function workflow(id: number): RequirementWorkflow {
  return {
    id,
    requirementId: String(id),
    title: '异步工作区状态',
    requirementType: 'REQUIREMENT',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

function context() {
  return {
    projectId: '5',
    userId: '1',
    clientSessionId: '9',
    centerBaseUrl: 'http://center.local'
  };
}

function flushPromises() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('requirement workspace state async report', () => {
  it('调度后异步执行上报并在节流窗口内跳过重复请求', async () => {
    const reporter = vi.fn().mockResolvedValue(undefined);
    const current = workflow(1001);

    expect(
      scheduleRequirementWorkspaceStateReport(context(), current, {
        now: () => 1_000,
        throttleMs: 10_000,
        reporter
      })
    ).toBe(true);
    await flushPromises();
    expect(reporter).toHaveBeenCalledTimes(1);

    expect(
      scheduleRequirementWorkspaceStateReport(context(), current, {
        now: () => 5_000,
        throttleMs: 10_000,
        reporter
      })
    ).toBe(false);
    await flushPromises();
    expect(reporter).toHaveBeenCalledTimes(1);

    expect(
      scheduleRequirementWorkspaceStateReport(context(), current, {
        now: () => 12_000,
        throttleMs: 10_000,
        reporter
      })
    ).toBe(true);
    await flushPromises();
    expect(reporter).toHaveBeenCalledTimes(2);
  });

  it('已有同一需求上报执行中时不重复排队', async () => {
    let resolveReport: (() => void) | undefined;
    const reporter = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReport = resolve;
        })
    );
    const current = workflow(1002);

    expect(
      scheduleRequirementWorkspaceStateReport(context(), current, {
        now: () => 1_000,
        throttleMs: 100,
        reporter
      })
    ).toBe(true);
    await flushPromises();
    expect(reporter).toHaveBeenCalledTimes(1);

    expect(
      scheduleRequirementWorkspaceStateReport(context(), current, {
        now: () => 2_000,
        throttleMs: 100,
        reporter
      })
    ).toBe(false);
    resolveReport?.();
    await flushPromises();

    expect(
      scheduleRequirementWorkspaceStateReport(context(), current, {
        now: () => 2_000,
        throttleMs: 100,
        reporter
      })
    ).toBe(true);
    await flushPromises();
    expect(reporter).toHaveBeenCalledTimes(2);
  });

  it('缺少中心需求主键或客户端会话时不调度', async () => {
    const reporter = vi.fn().mockResolvedValue(undefined);
    const withoutId = { ...workflow(1003), id: undefined };

    expect(scheduleRequirementWorkspaceStateReport(context(), withoutId, { reporter })).toBe(false);
    expect(scheduleRequirementWorkspaceStateReport({ ...context(), clientSessionId: '' }, workflow(1004), { reporter })).toBe(false);
    await flushPromises();
    expect(reporter).not.toHaveBeenCalled();
  });
});
