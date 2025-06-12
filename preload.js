const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getAllLocales: () => ipcRenderer.invoke('get-all-locales'), // Changed from getLocaleData
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    startUnfold: (path) => ipcRenderer.send('unfold-directory', path),
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (event, ...args) => callback(...args)),
    onUnfoldComplete: (callback) => ipcRenderer.on('unfold-complete', (event, ...args) => callback(...args)),
    onUnfoldError: (callback) => ipcRenderer.on('unfold-error', (event, ...args) => callback(...args)),
    openPath: (path) => ipcRenderer.send('shell:openPath', path),
    showAboutWindow: () => ipcRenderer.send('show-about-window')
});