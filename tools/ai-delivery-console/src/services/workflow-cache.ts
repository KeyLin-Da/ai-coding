import type { RequirementWorkflow } from '@shared/workflow';

const LIST_KEY = 'ai-delivery.workflow-cache.list';
const ITEM_PREFIX = 'ai-delivery.workflow-cache.item.';

export function saveWorkflowCache(workflows: RequirementWorkflow[]) {
  window.localStorage.setItem(LIST_KEY, JSON.stringify(workflows));
  for (const workflow of workflows) {
    window.localStorage.setItem(`${ITEM_PREFIX}${workflow.requirementId}`, JSON.stringify(workflow));
  }
}

export function saveWorkflowItemCache(workflow: RequirementWorkflow) {
  const workflows = loadWorkflowListCache().filter((item) => item.requirementId !== workflow.requirementId);
  workflows.unshift(workflow);
  saveWorkflowCache(workflows);
}

export function loadWorkflowListCache(): RequirementWorkflow[] {
  return parseJson(window.localStorage.getItem(LIST_KEY), []);
}

export function loadWorkflowItemCache(requirementId: string): RequirementWorkflow | null {
  return parseJson(window.localStorage.getItem(`${ITEM_PREFIX}${requirementId}`), null);
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
