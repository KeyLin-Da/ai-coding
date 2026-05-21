import http from 'node:http';
import { serverConfig } from './config';
import { createRouter } from './router';

const server = http.createServer(createRouter(serverConfig.workspaceRoot));

server.listen(serverConfig.port, '127.0.0.1', () => {
  console.log(`AI Delivery Runner listening on http://127.0.0.1:${serverConfig.port}`);
  console.log(`Workspace: ${serverConfig.workspaceRoot}`);
});
