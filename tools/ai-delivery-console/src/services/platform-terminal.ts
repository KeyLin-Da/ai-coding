import type { DesktopLocalConfig, DesktopOsType } from './desktop-local-config';

export interface TerminalCommandSpec {
  executable: string;
  args: string[];
}

export type DiagnosticStatus = 'OK' | 'WARN' | 'ERROR';

export interface DesktopDiagnosticItem {
  key: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
}

export function buildTerminalCommand(osType: DesktopOsType, command: string, cwd?: string): TerminalCommandSpec {
  if (osType === 'WINDOWS') {
    const script = cwd ? `Set-Location -LiteralPath '${escapePowerShell(cwd)}'; ${command}` : command;
    return {
      executable: 'wt.exe',
      args: ['powershell', '-NoExit', '-Command', script]
    };
  }
  if (osType === 'MACOS') {
    const script = cwd ? `cd ${quoteShell(cwd)} && ${command}` : command;
    return {
      executable: 'osascript',
      args: ['-e', `tell application "Terminal" to do script ${JSON.stringify(script)}`]
    };
  }
  return {
    executable: 'sh',
    args: ['-lc', cwd ? `cd ${quoteShell(cwd)} && ${command}` : command]
  };
}

export function createDesktopDiagnostics(config: DesktopLocalConfig, osType: DesktopOsType): DesktopDiagnosticItem[] {
  const agentProviders = config.agentProviders.filter((item) => item.enabled);
  const enabledCommands = new Set(agentProviders.map((item) => item.command.trim()).filter(Boolean));
  return [
    {
      key: 'workspace-mapping',
      label: '工作区映射',
      status: config.workspaceMappings.length ? 'OK' : 'WARN',
      detail: String(config.workspaceMappings.length)
    },
    {
      key: 'agent-provider',
      label: 'Agent Provider',
      status: agentProviders.length ? 'OK' : 'WARN',
      detail: agentProviders.map((item) => item.id).join(',') || '-'
    },
    {
      key: 'git',
      label: 'Git',
      status: enabledCommands.has('git') ? 'OK' : 'WARN',
      detail: enabledCommands.has('git') ? 'git' : '-'
    },
    {
      key: 'openspec',
      label: 'OpenSpec',
      status: enabledCommands.has('openspec') ? 'OK' : 'WARN',
      detail: enabledCommands.has('openspec') ? 'openspec' : '-'
    },
    {
      key: 'node',
      label: 'Node',
      status: enabledCommands.has('node') ? 'OK' : 'WARN',
      detail: enabledCommands.has('node') ? 'node' : '-'
    },
    {
      key: 'codex',
      label: 'Codex',
      status: enabledCommands.has('codex') ? 'OK' : 'WARN',
      detail: enabledCommands.has('codex') ? 'codex' : '-'
    },
    {
      key: 'terminal',
      label: '终端',
      status: osType === 'UNKNOWN' ? 'WARN' : 'OK',
      detail: config.terminalPreference
    }
  ];
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}
