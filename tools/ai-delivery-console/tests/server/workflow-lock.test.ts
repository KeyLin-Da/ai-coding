import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkflowLock } from '../../server/services/workflow-lock';

describe('WorkflowLock', () => {
  it('同一需求不允许重复获得锁', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-lock-'));
    const first = new WorkflowLock(root, '172014');
    const second = new WorkflowLock(root, '172014');
    await first.acquire();
    await expect(second.acquire()).rejects.toBeTruthy();
    await first.release();
    await expect(second.acquire()).resolves.toBeUndefined();
    await second.release();
  });
});
