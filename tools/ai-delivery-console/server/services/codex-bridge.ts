import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { RunStatus } from '../../shared/workflow';

export interface CodexExecutionResult {
  status: RunStatus;
  output: string;
  error?: string;
}

/**
 * 将 AI Delivery Console 的命令转换为 Codex 可执行的格式
 */
function convertToCodexCommand(commandText: string, workspaceRoot: string): string[] {
  // 解析命令文本，例如: /prd id=171634 c=描述 https://url
  const parts = commandText.trim().split(/\s+/);
  const skillName = parts[0].replace(/^\//, ''); // 移除开头的 /
  const args = parts.slice(1);

  // Codex 使用 npx codex exec 或直接调用 skill
  // 这里假设使用 codex CLI 工具
  return ['npx', 'codex', 'exec', '--skill', skillName, '--workspace', workspaceRoot, ...args];
}

/**
 * 执行 Codex 命令
 */
export async function executeWithCodex(
  workspaceRoot: string,
  commandText: string,
  requirementId: string
): Promise<CodexExecutionResult> {
  try {
    // 检查 codex 是否可用
    const codexPath = process.env.CODEX_PATH || 'npx';
    const codexArgs = process.env.CODEX_ARGS 
      ? process.env.CODEX_ARGS.split(' ')
      : ['codex', 'exec'];

    // 构建完整的命令
    const fullCommand = convertToCodexCommand(commandText, workspaceRoot);
    
    console.log(`[Codex Bridge] 执行命令: ${fullCommand.join(' ')}`);
    console.log(`[Codex Bridge] 工作目录: ${workspaceRoot}`);

    return new Promise((resolve) => {
      const child = spawn(codexPath, [...codexArgs, ...fullCommand.slice(1)], {
        cwd: workspaceRoot,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CODEX_WORKSPACE: workspaceRoot,
          CODEX_REQUIREMENT_ID: requirementId
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        const text = String(chunk);
        stdout += text;
        console.log(`[Codex Bridge] STDOUT: ${text}`);
      });

      child.stderr.on('data', (chunk) => {
        const text = String(chunk);
        stderr += text;
        console.error(`[Codex Bridge] STDERR: ${text}`);
      });

      child.on('error', (error) => {
        console.error(`[Codex Bridge] 执行错误: ${error.message}`);
        resolve({
          status: 'FAILED',
          output: stdout,
          error: `Codex 执行失败: ${error.message}`
        });
      });

      child.on('close', (code) => {
        console.log(`[Codex Bridge] 退出码: ${code}`);
        
        if (code === 0) {
          resolve({
            status: 'SUCCEEDED',
            output: stdout
          });
        } else {
          resolve({
            status: 'FAILED',
            output: stdout,
            error: stderr || `Codex 退出码: ${code}`
          });
        }
      });

      // 设置超时（默认 10 分钟）
      const timeout = Number(process.env.CODEX_TIMEOUT || 600000);
      setTimeout(() => {
        child.kill();
        resolve({
          status: 'FAILED',
          output: stdout,
          error: `Codex 执行超时 (${timeout}ms)`
        });
      }, timeout);
    });
  } catch (error: any) {
    console.error(`[Codex Bridge] 异常: ${error.message}`);
    return {
      status: 'FAILED',
      output: '',
      error: error.message
    };
  }
}

/**
 * 检查 Codex 是否可用
 */
export async function isCodexAvailable(): Promise<boolean> {
  try {
    const codexPath = process.env.CODEX_PATH || 'npx';
    return new Promise((resolve) => {
      const child = spawn(codexPath, ['--version'], {
        stdio: 'ignore'
      });

      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));

      // 快速超时检查
      setTimeout(() => {
        child.kill();
        resolve(false);
      }, 3000);
    });
  } catch {
    return false;
  }
}
