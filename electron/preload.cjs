const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ramPetWindow', {
  moveBy(delta) {
    return ipcRenderer.invoke('pet-window:move-by', delta)
  },
  showContextMenu() {
    return ipcRenderer.invoke('pet-window:show-context-menu')
  },
  onAction(callback) {
    const listener = (_event, action) => callback(action)
    ipcRenderer.on('pet-action', listener)
    return () => ipcRenderer.removeListener('pet-action', listener)
  },
})
