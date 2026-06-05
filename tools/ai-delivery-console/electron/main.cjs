const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const isDev = !app.isPackaged;

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

function createWindow() {
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

  const devUrl = process.env.AI_DELIVERY_DESKTOP_URL || 'http://127.0.0.1:5178';
  if (isDev) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
}

ipcMain.handle('local-config:read', readLocalConfig);
ipcMain.handle('local-config:write', (_event, config) => writeLocalConfig(config));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
