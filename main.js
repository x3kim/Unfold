const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Function to load ALL available language files from the 'locales' directory.
function loadAllLocales() {
    const localesDir = path.join(__dirname, 'locales');
    const locales = {};
    try {
        const files = fs.readdirSync(localesDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const langCode = path.basename(file, '.json'); // e.g., 'en'
                const data = fs.readFileSync(path.join(localesDir, file), 'utf-8');
                locales[langCode] = JSON.parse(data);
            }
        }
    } catch (error) {
        console.error('Could not load locale files.', error);
    }
    return locales;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 700,
        minWidth: 600,
        minHeight: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'logo.png')
    });
    mainWindow.loadFile('index.html');
}

let aboutWindow;

function createAboutWindow() {
    // If the window already exists, focus it
    if (aboutWindow) {
        aboutWindow.focus();
        return;
    }

    aboutWindow = new BrowserWindow({
        width: 800,
        height: 750,
        title: 'About Unfold',
        parent: mainWindow, // Makes it a child of the main window
        modal: true,         // Blocks interaction with the parent window
        resizable: true,     // Let users resize it
        minimizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, 'logo.png')
    });

    aboutWindow.loadFile('readme.html');
    aboutWindow.setMenu(null); // Remove the default menu

    // Clean up the reference when the window is closed
    aboutWindow.on('closed', () => {
        aboutWindow = null;
    });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

// Provide all loaded locale data to the renderer process
ipcMain.handle('get-all-locales', () => {
    return loadAllLocales();
});

ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

// ... Der Rest der Datei bleibt exakt gleich wie in der vorherigen Version ...
ipcMain.on('shell:openPath', (event, filePath) => {
    shell.openPath(filePath);
});

ipcMain.on('show-about-window', () => {
    createAboutWindow();
});

ipcMain.on('unfold-directory', async (event, sourcePath) => {
    const outputPath = `${sourcePath}_unfolded`;
    const logEntries = [];

    try {
        if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath);

        const allFiles = [];
        const nameMap = new Map();
        function findFiles(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (fullPath === outputPath) continue;
                    findFiles(fullPath);
                } else {
                    allFiles.push({ path: fullPath, name: entry.name });
                    const count = nameMap.get(entry.name) || 0;
                    nameMap.set(entry.name, count + 1);
                }
            }
        }
        findFiles(sourcePath);
        
        const conflicts = new Set();
        nameMap.forEach((count, name) => {
            if (count > 1) conflicts.add(name);
        });
        
        const conflictCounters = new Map();
        for (const [index, file] of allFiles.entries()) {
            const progress = Math.round(((index + 1) / allFiles.length) * 100);
            let destName = file.name;

            if (conflicts.has(file.name)) {
                const counter = (conflictCounters.get(file.name) || 0) + 1;
                conflictCounters.set(file.name, counter);
                const ext = path.extname(file.name);
                const baseName = path.basename(file.name, ext);
                destName = `[conflict-${counter}]-${baseName}${ext}`;
                logEntries.push({ type: 'RENAMED', from: file.path, to: destName });
            } else {
                logEntries.push({ type: 'COPIED', from: file.path, to: destName });
            }
            
            const destPath = path.join(outputPath, destName);
            try {
                fs.copyFileSync(file.path, destPath);
            } catch (copyError) {
                logEntries.push({ type: 'ERROR', from: file.path, message: copyError.message });
            }
            
            event.sender.send('progress-update', { progress, file: file.name });
        }

        const markdownLog = generateMarkdownLog(sourcePath, outputPath, logEntries);
        fs.writeFileSync(path.join(outputPath, 'documentation.md'), markdownLog);

        event.sender.send('unfold-complete', { outputPath, logEntries });

    } catch (error) {
        logEntries.push({ type: 'ERROR', from: 'FATAL', message: error.message });
        const markdownLog = generateMarkdownLog(sourcePath, outputPath, logEntries);
        if (fs.existsSync(outputPath)) {
            fs.writeFileSync(path.join(outputPath, 'documentation.md'), markdownLog);
        }
        event.sender.send('unfold-error', error.message);
    }
});

function generateMarkdownLog(source, dest, logs) {
    let md = `# Unfold Log\n\n`;
    md += `*   **Source:** \`${source}\`\n`;
    md += `*   **Destination:** \`${dest}\`\n`;
    md += `*   **Date:** ${new Date().toLocaleString()}\n\n`;

    const grouped = logs.reduce((acc, log) => {
        if (!acc[log.type]) acc[log.type] = [];
        acc[log.type].push(log);
        return acc;
    }, {});

    if (grouped.COPIED) {
        md += `### ✅ Copied (${grouped.COPIED.length})\n\n`;
        grouped.COPIED.forEach(log => md += `- \`${log.to}\`\n`);
    }
    if (grouped.RENAMED) {
        md += `\n### 🔵 Renamed (${grouped.RENAMED.length})\n\n`;
        grouped.RENAMED.forEach(log => md += `- **New:** \`${log.to}\` (from \`${log.from}\`)\n`);
    }
    if (grouped.ERROR) {
        md += `\n### ❌ Errors (${grouped.ERROR.length})\n\n`;
        grouped.ERROR.forEach(log => md += `- **File:** \`${log.from}\`\n  - **Error:** ${log.message}\n`);
    }
    return md;
}