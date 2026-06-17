import { describe, expect, it } from 'vitest';
import { defaultDesktopLocalConfig } from '../../src/services/desktop-local-config';
import { buildTerminalCommand, createDesktopDiagnostics } from '../../src/services/platform-terminal';

describe('platform-terminal', () => {
  it('为 macOS 生成 Terminal AppleScript 命令', () => {
    const command = buildTerminalCommand('MACOS', 'codex', '/Users/me/work');

    expect(command.executable).toBe('osascript');
    expect(command.args.join(' ')).toContain('Terminal');
    expect(command.args.join(' ')).toContain('/Users/me/work');
  });

  it('为 Windows 生成 Windows Terminal PowerShell 命令', () => {
    const command = buildTerminalCommand('WINDOWS', 'codex', 'C:\\work');

    expect(command.executable).toBe('wt.exe');
    expect(command.args).toContain('powershell');
    expect(command.args.join(' ')).toContain('Set-Location');
  });

  it('诊断本机基础配置状态', () => {
    const config = {
      ...defaultDesktopLocalConfig(),
      workspaceMappings: [{ projectId: 'p1', localPath: '/Users/me/work' }]
    };

    const diagnostics = createDesktopDiagnostics(config, 'MACOS');

    expect(diagnostics.find((item) => item.key === 'center-service')?.status).toBe('OK');
    expect(diagnostics.find((item) => item.key === 'runner-service')?.status).toBe('OK');
    expect(diagnostics.find((item) => item.key === 'workspace-mapping')?.status).toBe('OK');
    expect(diagnostics.find((item) => item.key === 'agent-provider')).toBeUndefined();
    expect(diagnostics.find((item) => item.key === 'git')).toBeUndefined();
    expect(diagnostics.find((item) => item.key === 'codex')).toBeUndefined();
  });

  it('未知系统时终端诊断进入提醒状态', () => {
    const config = defaultDesktopLocalConfig();

    const diagnostics = createDesktopDiagnostics(config, 'UNKNOWN');

    expect(diagnostics.find((item) => item.key === 'terminal')?.status).toBe('WARN');
  });
});
