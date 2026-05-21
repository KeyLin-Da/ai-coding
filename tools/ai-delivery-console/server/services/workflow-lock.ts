import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRequirementId } from './workspace';

export class WorkflowLock {
  private lockPath = '';

  constructor(private readonly workspaceRoot: string, private readonly requirementId: string) {}

  async acquire(): Promise<void> {
    const id = normalizeRequirementId(this.requirementId);
    const dir = path.join(this.workspaceRoot, 'docs', id, 'workflow');
    await fs.mkdir(dir, { recursive: true });
    this.lockPath = path.join(dir, '.lock');
    const handle = await fs.open(this.lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, lockedAt: new Date().toISOString() }));
    await handle.close();
  }

  async release(): Promise<void> {
    if (!this.lockPath) {
      return;
    }
    await fs.rm(this.lockPath, { force: true });
    this.lockPath = '';
  }
}
