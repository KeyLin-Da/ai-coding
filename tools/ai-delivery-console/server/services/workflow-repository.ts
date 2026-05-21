import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequirementInput, RequirementWorkflow, WorkflowStage } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { deriveCurrentStage } from '../../shared/stage-rules';
import { normalizeRequirementId } from './workspace';

export class WorkflowRepository {
  constructor(private readonly workspaceRoot: string) {}

  getWorkflowDir(requirementId: string): string {
    return path.join(this.workspaceRoot, 'docs', normalizeRequirementId(requirementId), 'workflow');
  }

  getStatePath(requirementId: string): string {
    return path.join(this.getWorkflowDir(requirementId), 'state.json');
  }

  async load(requirementId: string): Promise<RequirementWorkflow | null> {
    try {
      const content = await fs.readFile(this.getStatePath(requirementId), 'utf8');
      return JSON.parse(content) as RequirementWorkflow;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(workflow: RequirementWorkflow): Promise<RequirementWorkflow> {
    const workflowDir = this.getWorkflowDir(workflow.requirementId);
    await fs.mkdir(workflowDir, { recursive: true });
    const updated = {
      ...workflow,
      currentStage: deriveCurrentStage(workflow),
      updatedAt: new Date().toISOString()
    };
    const target = this.getStatePath(workflow.requirementId);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    await fs.rename(temp, target);
    return updated;
  }

  async upsert(input: RequirementInput): Promise<RequirementWorkflow> {
    const requirementId = normalizeRequirementId(input.requirementId);
    const existing = await this.load(requirementId);
    if (existing) {
      return this.save({
        ...existing,
        title: input.title || existing.title,
        branchName: input.branchName ?? existing.branchName,
        sources: input.sources?.length ? input.sources : existing.sources
      });
    }
    const now = new Date().toISOString();
    const workflow: RequirementWorkflow = {
      requirementId,
      title: input.title || `需求 ${requirementId}`,
      branchName: input.branchName,
      sources: input.sources || [],
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
    return this.save(workflow);
  }

  async list(): Promise<RequirementWorkflow[]> {
    const docsDir = path.join(this.workspaceRoot, 'docs');
    try {
      const entries = await fs.readdir(docsDir, { withFileTypes: true });
      const workflows = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => this.load(entry.name))
      );
      return workflows.filter(Boolean).sort((a, b) => String(b?.updatedAt).localeCompare(String(a?.updatedAt))) as RequirementWorkflow[];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async mergeStageArtifact(requirementId: string, stage: WorkflowStage, artifactPath: string): Promise<RequirementWorkflow> {
    const workflow = await this.load(requirementId);
    if (!workflow) {
      throw new Error(`需求不存在: ${requirementId}`);
    }
    workflow.stages[stage] = {
      ...workflow.stages[stage],
      artifactPath,
      status: workflow.stages[stage].status === 'NOT_STARTED' ? 'DRAFT' : workflow.stages[stage].status
    };
    return this.save(workflow);
  }
}
