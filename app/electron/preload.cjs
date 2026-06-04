const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectPdf:       () => ipcRenderer.invoke('select-pdf'),
  getPathForFile:  (file) => webUtils.getPathForFile(file),
  openExternal:    (url) => ipcRenderer.invoke('open-external', url),
  getSettings:     () => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s) => ipcRenderer.invoke('save-settings', s),
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  backendUrl:      'http://127.0.0.1:8001',
  isElectron:      true,
})
