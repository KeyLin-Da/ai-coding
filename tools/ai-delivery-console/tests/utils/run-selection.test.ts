import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../../shared/workflow';
import { findLatestStageRun } from '../../src/utils/run-selection';

function run(id: string, actionType: RunRecord['actionType'], startedAt: string, extra: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    requirementId: '172014',
    actionType,
    status: 'SUCCEEDED',
    startedAt,
    params: {},
    ...extra
  };
}

describe('run-selection', () => {
  it('普通阶段选择 startedAt 最新的 run', () => {
    const selected = findLatestStageRun(
      [
        run('old-prd', 'PRD_ANALYZE', '2026-06-02T01:00:00.000Z', { stage: 'PRD' }),
        run('new-prd', 'PRD_ANALYZE', '2026-06-02T02:00:00.000Z', { stage: 'PRD' })
      ],
      'PRD'
    );

    expect(selected?.id).toBe('new-prd');
  });

  it('实施阶段只在当前子步骤内选择最新 run', () => {
    const selected = findLatestStageRun(
      [
        run('apply-old', 'OPENSPEC_APPLY', '2026-06-02T01:00:00.000Z', { stage: 'IMPLEMENTATION', implementationStep: 'APPLY' }),
        run('inspect-newer', 'CODE_REVIEW', '2026-06-02T03:00:00.000Z', { stage: 'IMPLEMENTATION', implementationStep: 'CHANGE_INSPECTION' }),
        run('apply-new', 'OPENSPEC_APPLY', '2026-06-02T02:00:00.000Z', { stage: 'IMPLEMENTATION', implementationStep: 'APPLY' })
      ],
      'IMPLEMENTATION',
      'APPLY'
    );

    expect(selected?.id).toBe('apply-new');
  });
});
