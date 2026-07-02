import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildBootstrapImportPlan, importBootstrapPlan } from './services/bootstrap-importer';

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadProfileEnv } = require('../scripts/env-loader.cjs') as { loadProfileEnv: (rootDir: string) => void };

loadProfileEnv(toolDir);

interface CliArgs {
  centerBaseUrl: string;
  projectId: string;
  userId: string;
  accessToken: string;
  clientSessionId: string;
  workspaceRoot: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (name: string, fallback = '') => {
    const index = args.findIndex((item) => item === `--${name}`);
    return index >= 0 ? args[index + 1] || fallback : fallback;
  };
  return {
    centerBaseUrl: get('centerBaseUrl', process.env.VITE_AI_DELIVERY_CENTER_BASE_URL || 'http://127.0.0.1:8728'),
    projectId: get('projectId', process.env.AI_DELIVERY_PROJECT_ID || ''),
    userId: get('userId', process.env.AI_DELIVERY_USER_ID || ''),
    accessToken: get('accessToken', process.env.AI_DELIVERY_ACCESS_TOKEN || ''),
    clientSessionId: get('clientSessionId', process.env.AI_DELIVERY_CLIENT_SESSION_ID || ''),
    workspaceRoot: get('workspaceRoot', process.cwd()),
    dryRun: args.includes('--dryRun') || args.includes('--plan')
  };
}

async function main() {
  const args = parseArgs();
  if (!args.projectId || (!args.accessToken && !args.userId)) {
    throw new Error('缺少 --projectId，或缺少 --accessToken/--userId');
  }
  if (!args.dryRun && !args.clientSessionId) {
    throw new Error('缺少 --clientSessionId，无法定位当前客户端交付工作区');
  }
  const plan = await buildBootstrapImportPlan(args.workspaceRoot);
  if (args.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const result = await importBootstrapPlan(plan, args);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
