import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getApiKey:    () => ipcRenderer.invoke('get-api-key'),
  setApiKey:    (key) => ipcRenderer.invoke('set-api-key', key),
})
