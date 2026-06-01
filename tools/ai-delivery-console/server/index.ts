import http from 'node:http';
import { serverConfig } from './config';
import { createRouter } from './router';
import { syncCodingSkills } from './services/skill-sync';

const server = http.createServer(createRouter(serverConfig.workspaceRoot));

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
