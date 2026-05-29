const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ramPetWindow', {
  moveBy(delta) {
    return ipcRenderer.invoke('pet-window:move-by', delta)
  },
  startDrag(offset) {
    return ipcRenderer.invoke('pet-window:start-drag', offset)
  },
  endDrag() {
    return ipcRenderer.invoke('pet-window:end-drag')
  },
  setClickable(clickable) {
    return ipcRenderer.invoke('pet-window:set-clickable', clickable)
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
