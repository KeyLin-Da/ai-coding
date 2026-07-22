import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { serverConfig } from './config';
import { createRouter } from './router';
import { createEmbeddedTerminalUpgradeHandler } from './services/embedded-terminal-service';
import { syncCodingSkills } from './services/skill-sync';

const server = http.createServer(createRouter(serverConfig.workspaceRoot));
let embeddedTerminalUpgradeHandler: ReturnType<typeof createEmbeddedTerminalUpgradeHandler> | undefined;

function isEmbeddedTerminalUpgrade(request: IncomingMessage): boolean {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  return /(?:\/runner-api)?\/api\/ai-delivery\/runs\/[^/]+\/terminal$/.test(pathname);
}

function rejectUpgrade(socket: Socket, status = 503): void {
  socket.write(`HTTP/1.1 ${status} Service Unavailable\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

server.on('upgrade', (request, socket, head) => {
  if (!isEmbeddedTerminalUpgrade(request)) {
    socket.destroy();
    return;
  }
  try {
    embeddedTerminalUpgradeHandler ||= createEmbeddedTerminalUpgradeHandler(serverConfig.workspaceRoot);
    embeddedTerminalUpgradeHandler.handleUpgrade(request, socket, head, (ws: unknown) => {
      embeddedTerminalUpgradeHandler?.emit('connection', ws, request);
    });
  } catch (error) {
    console.warn('[embedded-terminal] WebSocket 初始化失败:', error instanceof Error ? error.message : error);
    rejectUpgrade(socket);
  }
});

async function start() {
  // Sync coding-* skills to all agent directories
  await syncCodingSkills(serverConfig.workspaceRoot);
  
  server.listen(serverConfig.port, '127.0.0.1', () => {
    console.log(`AI Delivery Runner listening on http://127.0.0.1:${serverConfig.port}`);
    console.log(`Workspace: ${serverConfig.workspaceRoot}`);
  });
}

start().catch((error) => {
  console.error('[startup] 启动失败:', error);
  process.exit(1);
});
