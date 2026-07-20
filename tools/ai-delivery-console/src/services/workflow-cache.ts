import type { RequirementWorkflow } from '@shared/workflow';
import { ensureWorkflowStages } from '@shared/workflow';

const LIST_KEY = 'ai-delivery.workflow-cache.list';
const ITEM_PREFIX = 'ai-delivery.workflow-cache.item.';

export function saveWorkflowCache(workflows: RequirementWorkflow[]) {
  const normalized = workflows.map(normalizeWorkflowCacheItem);
  window.localStorage.setItem(LIST_KEY, JSON.stringify(normalized));
  for (const workflow of normalized) {
    window.localStorage.setItem(`${ITEM_PREFIX}${workflow.requirementId}`, JSON.stringify(workflow));
  }
}

export function saveWorkflowItemCache(workflow: RequirementWorkflow) {
  const workflows = loadWorkflowListCache().filter((item) => item.requirementId !== workflow.requirementId);
  workflows.unshift(workflow);
  saveWorkflowCache(workflows);
}

export function loadWorkflowListCache(): RequirementWorkflow[] {
  return parseJson<RequirementWorkflow[]>(window.localStorage.getItem(LIST_KEY), []).map(normalizeWorkflowCacheItem);
}

export function loadWorkflowItemCache(requirementId: string): RequirementWorkflow | null {
  const workflow = parseJson<RequirementWorkflow | null>(window.localStorage.getItem(`${ITEM_PREFIX}${requirementId}`), null);
  return workflow ? normalizeWorkflowCacheItem(workflow) : null;
}

export function normalizeWorkflowCacheItem(workflow: RequirementWorkflow): RequirementWorkflow {
  return {
    ...workflow,
    prdSourceFiles: workflow.prdSourceFiles || [],
    techDesignSourceFiles: workflow.techDesignSourceFiles || [],
    prdSupplementBlocks: workflow.prdSupplementBlocks || [],
    prdClarificationBlocks: workflow.prdClarificationBlocks || [],
    techDesignSupplementBlocks: workflow.techDesignSupplementBlocks || [],
    openSpecSupplementBlocks: workflow.openSpecSupplementBlocks || [],
    openSpecVisualContextPaths: workflow.openSpecVisualContextPaths || [],
    stages: ensureWorkflowStages(workflow),
    retrospective: workflow.retrospective || {}
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
