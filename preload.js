// preload.js — el único puente entre la ventana (sin Node) y el proceso principal (con Node).
// Expone funciones concretas, nunca "ipcRenderer" completo ni "require" directo:
// así una página comprometida no puede pedirle a Node que haga cualquier cosa.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('decofis', {
  deriveArgon2id: (passwordB64, saltB64, memoryKiB, iterations) =>
    ipcRenderer.invoke('derive-argon2id', { passwordB64, saltB64, memoryKiB, iterations }),

  openFile: () => ipcRenderer.invoke('open-file-dialog'),
  saveFile: (suggestedName, dataB64) => ipcRenderer.invoke('save-file-dialog', { suggestedName, dataB64 }),

  checkUsed: (id) => ipcRenderer.invoke('check-used', id),
  markUsed: (id) => ipcRenderer.invoke('mark-used', id),

  randomBytes: (n) => ipcRenderer.invoke('random-bytes', n),

  copyTemp: (text, seconds) => ipcRenderer.invoke('clipboard-write-temp', { text, seconds })
});
