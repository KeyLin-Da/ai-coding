import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendRunEvent, readRunEventsWithTranscript, readTerminalTranscriptChunk } from '../../server/services/run-log';

describe('run-log', () => {
  it('读取运行事件时追加终端 transcript 合成事件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-run-log-'));
    const transcriptPath = 'docs/172014/workflow/runs/run-terminal.terminal.log';
    await appendRunEvent(root, '172014', 'run-terminal', {
      type: 'START',
      level: 'INFO',
      message: '准备在本地终端启动 Agent'
    });
    await fs.mkdir(path.dirname(path.join(root, transcriptPath)), { recursive: true });
    await fs.writeFile(path.join(root, transcriptPath), '[AI Delivery] 开始本地终端执行\nCodeBuddy 输出\n', 'utf8');

    const events = await readRunEventsWithTranscript(root, '172014', 'run-terminal', transcriptPath);

    expect(events.some((event) => event.type === 'START')).toBe(true);
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('CodeBuddy 输出'))).toBe(true);
  });

  it('按 offset 读取终端 transcript 增量', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-run-log-'));
    const transcriptPath = 'docs/172014/workflow/runs/run-terminal.terminal.log';
    await fs.mkdir(path.dirname(path.join(root, transcriptPath)), { recursive: true });
    await fs.writeFile(path.join(root, transcriptPath), '第一段输出\n', 'utf8');

    const first = await readTerminalTranscriptChunk(root, transcriptPath, 0);
    await fs.appendFile(path.join(root, transcriptPath), '第二段输出\n', 'utf8');
    const second = await readTerminalTranscriptChunk(root, transcriptPath, first.nextOffset);

    expect(first.event?.text).toContain('第一段输出');
    expect(second.event?.text).toContain('第二段输出');
    expect(second.event?.text).not.toContain('第一段输出');
  });
});
