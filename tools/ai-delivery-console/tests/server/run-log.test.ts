import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendRunEvent,
  readRawTerminalTranscriptChunk,
  readRunEventsWithTranscript,
  readTerminalTranscriptChunk,
  stripTerminalControlSequences
} from '../../server/services/run-log';
import { getRunRuntimeDir, toRuntimePathRef } from '../../server/services/runtime-paths';

describe('run-log', () => {
  it('读取运行事件时追加终端 transcript 合成事件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-run-log-'));
    const absoluteTranscriptPath = path.join(getRunRuntimeDir(root, '172014'), 'run-terminal.terminal.log');
    const transcriptPath = toRuntimePathRef(root, absoluteTranscriptPath);
    await appendRunEvent(root, '172014', 'run-terminal', {
      type: 'START',
      level: 'INFO',
      message: '准备在本地终端启动 Agent'
    });
    await fs.mkdir(path.dirname(absoluteTranscriptPath), { recursive: true });
    await fs.writeFile(absoluteTranscriptPath, '[AI Delivery] 开始本地终端执行\nCodeBuddy 输出\n', 'utf8');

    const events = await readRunEventsWithTranscript(root, '172014', 'run-terminal', transcriptPath);

    expect(events.some((event) => event.type === 'START')).toBe(true);
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('CodeBuddy 输出'))).toBe(true);
  });

  it('按 offset 读取终端 transcript 增量', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-run-log-'));
    const absoluteTranscriptPath = path.join(getRunRuntimeDir(root, '172014'), 'run-terminal.terminal.log');
    const transcriptPath = toRuntimePathRef(root, absoluteTranscriptPath);
    await fs.mkdir(path.dirname(absoluteTranscriptPath), { recursive: true });
    await fs.writeFile(absoluteTranscriptPath, '第一段输出\n', 'utf8');

    const first = await readTerminalTranscriptChunk(root, transcriptPath, 0);
    await fs.appendFile(absoluteTranscriptPath, '第二段输出\n', 'utf8');
    const second = await readTerminalTranscriptChunk(root, transcriptPath, first.nextOffset);

    expect(first.event?.text).toContain('第一段输出');
    expect(second.event?.text).toContain('第二段输出');
    expect(second.event?.text).not.toContain('第一段输出');
  });

  it('清理终端 transcript 中的 ANSI 控制序列', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-run-log-'));
    const absoluteTranscriptPath = path.join(getRunRuntimeDir(root, '172014'), 'run-terminal.terminal.log');
    const transcriptPath = toRuntimePathRef(root, absoluteTranscriptPath);
    await fs.mkdir(path.dirname(absoluteTranscriptPath), { recursive: true });
    await fs.writeFile(
      absoluteTranscriptPath,
      '\x1B[?2004h[AI Delivery] 开始执行\r\x1B[K\x1B[38;5;6;49mUpdate available\x1B[0m\n\x1B]0;Codex\x07完成\n',
      'utf8'
    );

    const result = await readTerminalTranscriptChunk(root, transcriptPath, 0);

    expect(result.event?.text).toContain('[AI Delivery] 开始执行');
    expect(result.event?.text).toContain('Update available');
    expect(result.event?.text).toContain('完成');
    expect(result.event?.text).not.toContain('\x1B');
    expect(result.event?.text).not.toContain('\x9B');
    expect(result.event?.text).not.toContain('[?2004h');
    expect(result.event?.text).not.toContain('[38;5;6;49m');
    expect(result.event?.text).not.toContain(']0;Codex');
  });

  it('清理控制序列时保留普通方括号日志内容', () => {
    expect(stripTerminalControlSequences('[AI Delivery] [INFO] 正常输出')).toBe('[AI Delivery] [INFO] 正常输出');
  });

  it('同时返回 stripped transcript 和 raw ANSI transcript', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-run-log-'));
    const runDir = getRunRuntimeDir(root, '172014');
    const absoluteTranscriptPath = path.join(runDir, 'run-embedded.terminal.log');
    const absoluteRawTranscriptPath = path.join(runDir, 'run-embedded.terminal.ansi');
    const transcriptPath = toRuntimePathRef(root, absoluteTranscriptPath);
    const rawTranscriptPath = toRuntimePathRef(root, absoluteRawTranscriptPath);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(absoluteTranscriptPath, 'ready\n', 'utf8');
    await fs.writeFile(absoluteRawTranscriptPath, '\x1B[32mready\x1B[0m\n', 'utf8');

    const raw = await readRawTerminalTranscriptChunk(root, rawTranscriptPath, 0);
    const events = await readRunEventsWithTranscript(root, '172014', 'run-embedded', transcriptPath, rawTranscriptPath);
    const transcriptEvent = events.find((event) => event.type === 'STDOUT');

    expect(raw.text).toContain('\x1B[32mready');
    expect(transcriptEvent?.text).toBe('ready\n');
    expect((transcriptEvent?.data as any).rawText).toContain('\x1B[32mready');
  });
});
