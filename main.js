const { app, BrowserWindow, ipcMain, dialog, session, clipboard } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { argon2id } = require('hash-wasm');
const isDev = !app.isPackaged;
const usedStorePath = () => path.join(app.getPath('userData'), 'used-messages.json');
async function loadUsedStore() {
try {
  const raw = await fs.readFile(usedStorePath(), 'utf8');
  return JSON.parse(raw);
} catch {
  return {};
}
}
async function saveUsedStore(data) {
 await fs.writeFile(usedStorePath(), JSON.stringify(data), 'utf8');
}

function createWindow() {
  const win = new BrowserWindow({
  width: 880,
  height: 880,
  minWidth: 640,
  minHeight: 640,
  autoHideMenuBar: true,
  backgroundColor: '#10151c',
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    spellcheck: false,
    devTools: isDev
    }
  });

  win.setMenuBarVisibility(false);
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (!isDev) {
    win.webContents.on('before-input-event', (e, input) => {
      const blockedCombo =
        (input.key === 'F12') ||
        (input.control && input.shift && ['I', 'J', 'C'].includes(input.key));
      if (blockedCombo) e.preventDefault();
    });
  }
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  return win;
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:;"
        ]
      }
    });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
ipcMain.handle('derive-argon2id', async (_evt, { passwordB64, saltB64, memoryKiB, iterations }) => {
  const password = Buffer.from(passwordB64, 'base64').toString('utf8');
  const salt = Buffer.from(saltB64, 'base64');
  const hash = await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: iterations || 3,
    memorySize: memoryKiB || 65536,
    hashLength: 32,
    outputType: 'binary'
  });
  return Buffer.from(hash).toString('base64');
});
ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  const buf = await fs.readFile(filePaths[0]);
  return {
    path: filePaths[0],
    name: path.basename(filePaths[0]),
    dataB64: buf.toString('base64')
  };
});
ipcMain.handle('save-file-dialog', async (_evt, { suggestedName, dataB64 }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggestedName
  });
  if (canceled || !filePath) return { saved: false };
  await fs.writeFile(filePath, Buffer.from(dataB64, 'base64'));
  return { saved: true, path: filePath };
});
ipcMain.handle('check-used', async (_evt, id) => {
  const store = await loadUsedStore();
  return Boolean(store[id]);
});
ipcMain.handle('mark-used', async (_evt, id) => {
  const store = await loadUsedStore();
  store[id] = Date.now();
  await saveUsedStore(store);
  return true;
});
ipcMain.handle('random-bytes', async (_evt, n) => {
  return crypto.randomBytes(n).toString('base64');
});
ipcMain.handle('clipboard-write-temp', async (_evt, { text, seconds }) => {
  clipboard.writeText(text);
  setTimeout(() => {
    if (clipboard.readText() === text) clipboard.clear();
  }, (seconds || 20) * 1000);
  return true;
});
