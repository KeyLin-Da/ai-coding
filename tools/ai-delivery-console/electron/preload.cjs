const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiDeliveryDesktop', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  localConfig: {
    load: () => ipcRenderer.invoke('local-config:read'),
    save: (config) => ipcRenderer.invoke('local-config:write', config)
  }
});
