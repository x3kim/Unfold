const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Initialize the store
const store = new Store();

let mainWindow;
const allLocales = loadAllLocales(); // Load all languages once on startup

// Function to load ALL available language files from the 'locales' directory.
function loadAllLocales() {
    const localesDir = path.join(__dirname, 'locales');
    const locales = {};
    try {
        const files = fs.readdirSync(localesDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const langCode = path.basename(file, '.json');
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
    // 1. Define defaults and maximums using your chosen values
    const defaultWidth = 600;
    const defaultHeight = 500;
    const maxWidth = 1200;
    const maxHeight = 1000;

    // 2. Load the last window state from the store, but only care about size
    const windowBounds = store.get('windowBounds', {
        width: defaultWidth,
        height: defaultHeight
    });

    mainWindow = new BrowserWindow({
        // Use the saved size, or the defaults.
        // By omitting x and y, Electron will center the window by default.
        width: windowBounds.width,
        height: windowBounds.height,
        
        // Apply our constraints
        minWidth: 600,
        minHeight: 500,
        maxWidth: maxWidth,
        maxHeight: maxHeight,

        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'logo.png')
    });

    // 3. Save the window's state when it's moved or resized
    // Using 'resized' and 'moved' events is more reliable than 'close'
    const saveBounds = () => {
        store.set('windowBounds', mainWindow.getBounds());
    };
    mainWindow.on('resized', saveBounds);
    mainWindow.on('moved', saveBounds);

    mainWindow.loadFile('index.html');
}

let aboutWindow;

function createAboutWindow(lang) {
    if (aboutWindow) {
        aboutWindow.focus();
        return;
    }

    const templatePath = path.join(__dirname, 'about.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
    
    const stylePath = path.join(__dirname, 'readme-style.css');
    const styles = fs.readFileSync(stylePath, 'utf-8');
    htmlTemplate = htmlTemplate.replace('{{styles}}', styles);

    const logoPath = path.join(__dirname, 'logo.png');
    const logoBuffer = fs.readFileSync(logoPath);
    const logoBase64 = logoBuffer.toString('base64');
    const logoSrc = `data:image/png;base64,${logoBase64}`;
    htmlTemplate = htmlTemplate.replace('{{logoSrc}}', logoSrc);

    const translations = allLocales[lang] || allLocales['en'];

    for (const key in translations) {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        htmlTemplate = htmlTemplate.replace(placeholder, translations[key]);
    }

    aboutWindow = new BrowserWindow({
        width: 800,
        height: 750,
        title: translations.aboutTitle || 'About Unfold',
        parent: mainWindow,
        modal: process.platform === 'darwin' ? false : true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, 'logo.png')
    });

    aboutWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlTemplate));
    aboutWindow.setMenu(null); 

    aboutWindow.on('closed', () => {
        aboutWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// --- IPC Handlers ---

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-all-locales', () => {
    return allLocales;
});

ipcMain.on('show-about-window', (event, lang) => {
    createAboutWindow(lang);
});

ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

ipcMain.on('shell:openPath', (event, filePath) => {
    shell.openPath(filePath);
});

ipcMain.on('unfold-directory', async (event, sourcePath) => {
    const outputPath = `${sourcePath}_unfolded`;
    const logEntries = [];

    try {
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath);
        }

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
            if (count > 1) {
                conflicts.add(name);
            }
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
                logEntries.push({ type: 'RENAMED', from: file.path, to: destName, originalName: file.name });
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
        if (!acc[log.type]) {
            acc[log.type] = [];
        }
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