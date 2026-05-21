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
  codexCommand: process.env.CODEX_COMMAND || 'codex exec -C {workspaceRoot} -'
};
