const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const Store = require('electron-store');
const archiver = require('archiver');

const store = new Store();
let mainWindow;
const allLocales = loadAllLocales();

const IGNORE_LIST = new Set([
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini'
]);

function loadAllLocales() {
    const localesDir = path.join(__dirname, 'locales');
    const locales = {};
    try {
        const files = fsSync.readdirSync(localesDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const langCode = path.basename(file, '.json');
                const data = fsSync.readFileSync(path.join(localesDir, file), 'utf-8');
                locales[langCode] = JSON.parse(data);
            }
        }
    } catch (error) { console.error('Could not load locale files.', error); }
    return locales;
}

function createWindow() {
    const defaultWidth = 600;
    const defaultHeight = 600;
    const minWidth = 500;
    const minHeight = 550;

    const windowBounds = store.get('windowBounds', {
        width: defaultWidth,
        height: defaultHeight
    });

    mainWindow = new BrowserWindow({
        width: windowBounds.width,
        height: windowBounds.height,
        minWidth: minWidth,
        minHeight: minHeight,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'logo.png')
    });

    const saveBounds = () => {
        if (!mainWindow.isMinimized()) {
            store.set('windowBounds', mainWindow.getBounds());
        }
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
    let htmlTemplate = fsSync.readFileSync(templatePath, 'utf-8');
    const stylePath = path.join(__dirname, 'readme-style.css');
    const styles = fsSync.readFileSync(stylePath, 'utf-8');
    htmlTemplate = htmlTemplate.replace('{{styles}}', styles);
    const logoPath = path.join(__dirname, 'logo.png');
    const logoBuffer = fsSync.readFileSync(logoPath);
    const logoBase64 = logoBuffer.toString('base64');
    const logoSrc = `data:image/png;base64,${logoBase64}`;
    htmlTemplate = htmlTemplate.replace('{{logoSrc}}', logoSrc);
    const translations = allLocales[lang] || allLocales['en'];
    for (const key in translations) {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        htmlTemplate = htmlTemplate.replace(placeholder, translations[key]);
    }
    aboutWindow = new BrowserWindow({
        width: 800, height: 750,
        title: translations.aboutTitle || 'About Unfold',
        parent: mainWindow,
        modal: process.platform !== 'darwin',
        webPreferences: { nodeIntegration: false, contextIsolation: true, },
        icon: path.join(__dirname, 'logo.png')
    });
    aboutWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlTemplate));
    aboutWindow.setMenu(null); 
    aboutWindow.on('closed', () => { aboutWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-all-locales', () => allLocales);
ipcMain.on('show-about-window', (event, lang) => createAboutWindow(lang));
ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return canceled ? null : filePaths[0];
});
ipcMain.on('shell:openPath', (event, filePath) => shell.openPath(filePath));

// --- Helper function to check for existence of a directory ---
async function directoryExists(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return stats.isDirectory();
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

ipcMain.on('unfold-directory', async (event, sourcePath, options) => {
    try {
        const nodeModulesPath = path.join(sourcePath, 'node_modules');
        if (await directoryExists(nodeModulesPath)) {
            event.sender.send('unfold-error', 'Source folder contains a "node_modules" directory. This is not supported to prevent errors.');
            return;
        }
        if (path.basename(sourcePath).endsWith('_unfolded')) {
            event.sender.send('unfold-error', 'Cannot run Unfold on an already unfolded directory.');
            return;
        }
    } catch (e) {
        event.sender.send('unfold-error', `A critical error occurred while checking the source folder: ${e.message}`);
        return;
    }

    const startTime = Date.now();
    const outputPath = `${sourcePath}_unfolded`;
    const logEntries = [];

    try {
        if (options.mode !== 'dry-run') await fs.mkdir(outputPath, { recursive: true });

        const allFiles = [];
        const nameMap = new Map();
        
        async function findFiles(dir) {
            let entries;
            try {
                entries = await fs.readdir(dir);
            } catch (err) {
                console.error(`Could not read directory: ${dir}`, err);
                return;
            }

            const promises = entries.map(async (entryName) => {
                if (IGNORE_LIST.has(entryName)) {
                    return;
                }

                const fullPath = path.join(dir, entryName);
                let stats;
                try {
                    stats = await fs.lstat(fullPath); 
                } catch (err) {
                    console.error(`Could not stat path: ${fullPath}`, err);
                    return;
                }
                
                if (stats.isDirectory()) {
                    if (fullPath === outputPath || entryName === 'node_modules') return;
                    await findFiles(fullPath);
                } else if (stats.isFile()) {
                    allFiles.push({ path: fullPath, name: entryName });
                }
            });
            await Promise.all(promises);
        }
        await findFiles(sourcePath);

        allFiles.forEach(file => {
            const count = nameMap.get(file.name) || 0;
            nameMap.set(file.name, count + 1);
        });

        const conflicts = new Set();
        nameMap.forEach((count, name) => { if (count > 1) conflicts.add(name); });
        
        const conflictCounters = new Map();
        const copyErrors = [];

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
            if (options.mode === 'copy' || options.mode === 'move') {
                try {
                    await fs.copyFile(file.path, destPath);
                } catch (copyError) {
                    const errorEntry = { type: 'ERROR', from: file.path, message: copyError.message };
                    logEntries.push(errorEntry);
                    copyErrors.push(errorEntry);
                }
            }
            if ((index + 1) % 10 === 0 || progress === 100) {
               event.sender.send('progress-update', { progress, file: file.name });
            }
        }

        if (options.mode === 'move') {
            if (copyErrors.length === 0) {
                logEntries.unshift({ type: 'INFO', messageKey: 'infoMoveSuccess' });
                await fs.rm(sourcePath, { recursive: true, force: true });
                logEntries.unshift({ type: 'SUCCESS', messageKey: 'infoMoveSuccessDone' });
            } else {
                logEntries.unshift({ type: 'FATAL', messageKey: 'infoMoveFatal', vars: { errorCount: copyErrors.length } });
            }
        }

        const duration = Date.now() - startTime;
        const markdownLog = generateMarkdownLog(sourcePath, outputPath, logEntries, duration, allLocales.en);
        if (options.mode !== 'dry-run') {
            await fs.writeFile(path.join(outputPath, 'documentation.md'), markdownLog);
        }
        
        let wasOpened = false;
        if (options.shouldOpen && options.mode !== 'dry-run') {
            const pathToOpen = options.shouldZip ? path.dirname(outputPath) : outputPath;
            await shell.openPath(pathToOpen);
            wasOpened = true;
        }

        const parentPath = path.dirname(outputPath);
        event.sender.send('unfold-complete', { outputPath, parentPath, logEntries, duration, wasOpened });

        if (options.shouldZip && options.mode !== 'dry-run') {
            try {
                const zipPath = path.join(path.dirname(sourcePath), `${path.basename(sourcePath)}_unfolded.zip`);
                await createZipArchive(outputPath, zipPath);
            } catch (zipError) {
                console.error('Zipping failed:', zipError);
                logEntries.push({ type: 'ERROR', from: outputPath, message: `Failed to create ZIP archive: ${zipError.message}`});
                event.sender.send('unfold-complete', { outputPath, parentPath, logEntries, duration, wasOpened });
            }
        }

    } catch (error) {
        console.error('Unfold process failed:', error);
        const errorMessage = error.message || 'An unknown error occurred.';
        event.sender.send('unfold-error', errorMessage);
    }
});

function createZipArchive(sourceDir, outPath) {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fsSync.createWriteStream(outPath);

    return new Promise((resolve, reject) => {
        archive
            .on('warning', err => {
                if (err.code === 'ENOENT') {
                    console.warn('Archiver warning: ', err);
                } else {
                    reject(err);
                }
            })
            .on('error', err => reject(err));
        
        stream.on('close', () => {
            console.log(`Zip archive created successfully: ${archive.pointer()} total bytes`);
            resolve();
        });
        stream.on('error', err => reject(err));
        
        archive.pipe(stream);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

function generateMarkdownLog(source, dest, logs, duration, locale) {
    let md = `# Unfold Log\n\n`;
    md += `*   **Source:** \`${source}\`\n`;
    md += `*   **Destination:** \`${dest}\`\n`;
    md += `*   **Date:** ${new Date().toLocaleString()}\n`;
    md += `*   **${locale.resultsDuration || 'Duration:'}** ${(duration / 1000).toFixed(2)} ${locale.resultsDurationSeconds || 'seconds'}\n\n`;

    const specialMessages = logs.filter(log => ['INFO', 'SUCCESS', 'FATAL'].includes(log.type));
    if (specialMessages.length > 0) {
        md += `## Summary\n\n`;
        specialMessages.forEach(msg => {
            let text = locale[msg.messageKey] || msg.messageKey;
            if (msg.vars) {
                text = text.replace('{errorCount}', msg.vars.errorCount);
            }
            md += `*   **${msg.type}:** ${text}\n`;
        });
        md += `\n---\n\n`;
    }

    const fileLogs = logs.filter(log => !['INFO', 'SUCCESS', 'FATAL'].includes(log.type));
    const grouped = fileLogs.reduce((acc, log) => {
        if (!acc[log.type]) acc[log.type] = [];
        acc[log.type].push(log);
        return acc;
    }, {});

    if (grouped.COPIED) {
        md += `### ✅ ${locale.logCopied || 'Copied Files'} (${grouped.COPIED.length})\n\n`;
        grouped.COPIED.forEach(log => md += `- \`${log.to}\`\n`);
    }
    if (grouped.RENAMED) {
        md += `\n### 🔵 ${locale.logRenamed || 'Renamed Files'} (${grouped.RENAMED.length})\n\n`;
        grouped.RENAMED.forEach(log => md += `- **New:** \`${log.to}\` (from \`${log.from}\`)\n`);
    }
    if (grouped.ERROR) {
        md += `\n### ❌ ${locale.logErrors || 'Errors'} (${grouped.ERROR.length})\n\n`;
        grouped.ERROR.forEach(log => md += `- **File:** \`${log.from}\`\n  - **Error:** ${log.message}\n`);
    }
    return md;
}