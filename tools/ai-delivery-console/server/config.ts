import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const serverConfig = {
  port: Number(process.env.AI_DELIVERY_PORT || 8718),
  toolDir,
  workspaceRoot: path.resolve(process.env.AI_DELIVERY_WORKSPACE_ROOT || path.join(toolDir, '..', '..')),
  agentProvidersPath: process.env.AGENT_PROVIDERS_PATH,
  agentProvidersJson: process.env.AGENT_PROVIDERS_JSON,
  defaultAgentId: process.env.DEFAULT_AGENT_ID || 'manual',
  agentTimeout: Number(process.env.AGENT_TIMEOUT || 600000),
  codexCommand: process.env.CODEX_COMMAND || 'codex exec -C {workspaceRoot} {projectParentAddDirArgs} -',
  codexInteractiveCommand: process.env.CODEX_INTERACTIVE_COMMAND || 'codex -C {workspaceRoot} {projectParentAddDirArgs} --no-alt-screen {prompt}',
  codebuddyCommand: process.env.CODEBUDDY_COMMAND || 'codebuddy --add-dir {workspaceRoot} {projectAddDirArgs} -',
  codebuddyInteractiveCommand: process.env.CODEBUDDY_INTERACTIVE_COMMAND || 'codebuddy --add-dir {workspaceRoot} {projectAddDirArgs} -',
  qoderCommand: process.env.QODER_COMMAND || 'qoderclicn -w {workspaceRoot} -',
  qoderInteractiveCommand: process.env.QODER_INTERACTIVE_COMMAND || 'qoderclicn -w {workspaceRoot} -',
  qwenCommand: process.env.QWEN_COMMAND || 'qwen -',
  qwenInteractiveCommand: process.env.QWEN_INTERACTIVE_COMMAND || 'qwen -'
};
