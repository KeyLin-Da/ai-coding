import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const serverConfig = {
  port: Number(process.env.AI_DELIVERY_PORT || 8718),
  toolDir,
  workspaceRoot: path.resolve(process.env.AI_DELIVERY_WORKSPACE_ROOT || path.join(toolDir, '..', '..')),
  // Codex 配置
  codex: {
    enabled: process.env.CODEX_ENABLED === 'true',
    path: process.env.CODEX_PATH || 'npx',
    args: process.env.CODEX_ARGS || 'codex exec',
    timeout: Number(process.env.CODEX_TIMEOUT || 600000) // 默认 10 分钟
  }
};
