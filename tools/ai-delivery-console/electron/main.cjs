const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { loadProfileEnv, resolveEnvProfile } = require('../scripts/env-loader.cjs');

const isDev = !app.isPackaged;
let devServerProcess;
let runnerServerProcess;

loadProfileEnv(path.join(__dirname, '..'));

function configPath() {
  return path.join(app.getPath('userData'), 'local-config.bin');
}

async function readLocalConfig() {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    if (raw.startsWith('encrypted:') && safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw.slice('encrypted:'.length), 'base64')));
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function writeLocalConfig(config) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  const json = JSON.stringify(config || {}, null, 2);
  const payload = safeStorage.isEncryptionAvailable()
    ? `encrypted:${safeStorage.encryptString(json).toString('base64')}`
    : json;
  await fs.writeFile(configPath(), payload, { mode: 0o600 });
  return true;
}

function requestUrl(url) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const request = client.get(parsedUrl, (response) => {
      response.resume();
      resolve(true);
    });
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await requestUrl(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureDevServer(devUrl) {
  if (await requestUrl(devUrl)) {
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  devServerProcess = spawn(npmCommand, ['run', `dev:${resolveEnvProfile()}`], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit'
  });

  const ready = await waitForUrl(devUrl, 20000);
  if (!ready) {
    throw new Error(`Vite dev server did not become ready: ${devUrl}`);
  }
}

async function ensureRunnerServer(runnerUrl) {
  if (await requestUrl(runnerUrl)) {
    console.log('[Runner] 已在运行，跳过启动');
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runnerServerProcess = spawn(npmCommand, ['run', `server:dev:${resolveEnvProfile()}`], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: 'inherit',
    detached: process.platform !== 'win32'  // macOS/Linux 用进程组便于整树杀死
  });

  runnerServerProcess.on('error', (err) => {
    console.error('[Runner] 启动失败:', err.message);
  });
  runnerServerProcess.on('exit', (code, signal) => {
    console.log(`[Runner] 进程退出 code=${code} signal=${signal}`);
    runnerServerProcess = null;
  });

  console.log('[Runner] 等待服务就绪...');
  const ready = await waitForUrl(runnerUrl, 30000);
  if (ready) {
    console.log('[Runner] 服务已就绪');
  } else {
    console.warn(`[Runner] 服务未在 30s 内就绪: ${runnerUrl}，将继续启动桌面端`);
  }
}

function killRunnerServer() {
  if (!runnerServerProcess || runnerServerProcess.killed) return;
  try {
    if (process.platform !== 'win32' && runnerServerProcess.pid) {
      // 杀掉整个进程组（含 npm -> tsx -> node 子树）
      process.kill(-runnerServerProcess.pid, 'SIGTERM');
    } else {
      runnerServerProcess.kill();
    }
  } catch (e) {
    // 进程可能已退出，忽略 ESRCH
  }
  runnerServerProcess = null;
}

async function createWindow() {
  const preloadPath = isDev ? path.join(__dirname, 'preload.cjs') : path.join(app.getAppPath(), 'electron/preload.cjs');
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    title: 'AI Delivery Console',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devPort = process.env.VITE_AI_DELIVERY_DEV_PORT || '5178';
  const devUrl = `http://127.0.0.1:${devPort}`;
  const runnerUrl = process.env.VITE_AI_DELIVERY_RUNNER_BASE_URL || 'http://127.0.0.1:8718';

  // 开发模式和生产模式都启动 Runner 后端
  await ensureRunnerServer(`${runnerUrl}/api/ai-delivery/health`);

  if (isDev) {
    await ensureDevServer(devUrl);
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
}

ipcMain.handle('local-config:read', readLocalConfig);
ipcMain.handle('local-config:write', (_event, config) => writeLocalConfig(config));
ipcMain.handle('desktop:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('desktop:list-subdirectories', async (_event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: path.join(dirPath, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return dirs;
  } catch (error) {
    return [];
  }
});

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error(error);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        console.error(error);
      });
    }
  });
});

app.on('before-quit', () => {
  killRunnerServer();
  if (devServerProcess && !devServerProcess.killed) {
    devServerProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
