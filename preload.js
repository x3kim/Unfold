const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAllLocales: () => ipcRenderer.invoke('get-all-locales'),
    showAboutWindow: (lang) => ipcRenderer.send('show-about-window', lang),
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    
    // UPDATED: startUnfold now accepts an options object
    startUnfold: (path, options) => ipcRenderer.send('unfold-directory', path, options),
    
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (event, ...args) => callback(...args)),
    onUnfoldComplete: (callback) => ipcRenderer.on('unfold-complete', (event, ...args) => callback(...args)),
    onUnfoldError: (callback) => ipcRenderer.on('unfold-error', (event, ...args) => callback(...args)),
    
    // NEW: Listener for zip completion notification
    onZipComplete: (callback) => ipcRenderer.on('zip-complete', (event, ...args) => callback(...args)),

    openPath: (path) => ipcRenderer.send('shell:openPath', path)
});