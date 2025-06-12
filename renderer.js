let allLocaleData = {};
let currentLang = 'en';
let lastLogEntries = null;

function applyTranslations() {
    const localeData = allLocaleData[currentLang];
    if (!localeData) return;
    document.querySelectorAll('[data-i18n-key]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-key');
        if (localeData[key]) elem.textContent = localeData[key];
    });
    document.querySelectorAll('[data-i18n-tooltip-key]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-tooltip-key');
        if (localeData[key]) elem.dataset.tooltip = localeData[key];
    });
    document.querySelectorAll('[data-i18n-aria-key]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-aria-key');
        if (localeData[key]) elem.setAttribute('aria-label', localeData[key]);
    });
}

function setLanguage(lang) {
    if (!allLocaleData[lang]) return;
    currentLang = lang;
    localStorage.setItem('user-lang', lang);
    applyTranslations();
    document.querySelectorAll('.lang-link').forEach(link => {
        link.classList.toggle('active', link.dataset.lang === lang);
    });
    const resultsView = document.getElementById('results-view');
    if (!resultsView.classList.contains('hidden') && lastLogEntries) {
        const duration = parseFloat(resultsView.dataset.duration) || 0;
        const wasOpened = resultsView.dataset.wasOpened === 'true';
        displayResults(lastLogEntries, duration, wasOpened);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    allLocaleData = await window.electronAPI.getAllLocales();
    const appVersion = await window.electronAPI.getAppVersion();
    document.getElementById('app-version').textContent = `v${appVersion}`;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.body.classList.add('dark-mode');

    const storedLang = localStorage.getItem('user-lang');
    const systemLang = navigator.language.split('-')[0];
    let initialLang = 'en';
    if (allLocaleData[storedLang]) initialLang = storedLang;
    else if (allLocaleData[systemLang]) initialLang = systemLang;
    
    const mainView = document.getElementById('main-view');
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const startBtn = document.getElementById('start-btn');
    const selectedFolderPath = document.getElementById('selected-folder-path');
    const statusArea = document.getElementById('status-area');
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');
    const themeSwitcher = document.querySelector('.theme-switcher');
    const aboutLink = document.getElementById('about-link');
    const resultsView = document.getElementById('results-view');
    const resultsSummary = document.getElementById('results-summary');
    const logDetailsContainer = document.getElementById('log-details-container');
    const openLogBtn = document.getElementById('open-log-btn');
    const backToMainBtn = document.getElementById('back-to-main-btn');
    const controlsWrapper = document.getElementById('controls-wrapper');
    const modeButtons = document.querySelectorAll('.mode-btn');
    const moveWarning = document.getElementById('move-warning');
    const moveConfirmCheckbox = document.getElementById('move-confirm-checkbox');
    const zipCheckbox = document.getElementById('zip-checkbox');
    const openFolderCheckbox = document.getElementById('open-folder-checkbox');
    const openOutputFolderBtn = document.getElementById('open-output-folder-btn');

    let currentFolderPath = null;
    let finalOutputPath = null;
    let finalParentPath = null;
    let selectedMode = 'copy';

    themeSwitcher.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    modeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            modeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            selectedMode = button.dataset.mode;
            moveWarning.classList.toggle('hidden', selectedMode !== 'move');
            updateStartButtonState();
        });
    });

    [moveConfirmCheckbox, zipCheckbox, openFolderCheckbox].forEach(cb => {
        cb.addEventListener('change', updateStartButtonState);
    });

    document.querySelectorAll('.lang-link').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); setLanguage(link.dataset.lang); });
    });

    aboutLink.addEventListener('click', (e) => { e.preventDefault(); window.electronAPI.showAboutWindow(currentLang); });

    selectFolderBtn.addEventListener('click', async () => {
        currentFolderPath = await window.electronAPI.selectFolder();
        if (currentFolderPath) {
            selectedFolderPath.textContent = currentFolderPath;
            controlsWrapper.classList.remove('hidden');
            updateStartButtonState();
        }
    });

    startBtn.addEventListener('click', () => {
        if (currentFolderPath) {
            setProcessingState(true);
            const options = {
                mode: selectedMode,
                shouldZip: zipCheckbox.checked,
                shouldOpen: openFolderCheckbox.checked
            };
            window.electronAPI.startUnfold(currentFolderPath, options);
        }
    });
    
    window.electronAPI.onProgressUpdate(({ progress, file }) => {
        progressBar.style.width = `${progress}%`;
        const localeData = allLocaleData[currentLang] || {};
        const statusKey = localeData.processingStatus || 'Processing:';
        statusText.textContent = `[${progress}%] ${statusKey} ${file}`;
    });

    window.electronAPI.onUnfoldComplete(({ outputPath, parentPath, logEntries, duration, wasOpened }) => {
        finalOutputPath = outputPath;
        finalParentPath = parentPath;
        displayResults(logEntries, duration, wasOpened);
    });

    window.electronAPI.onUnfoldError((errorMessage) => {
        progressBar.style.width = '100%';
        progressBar.classList.add('error');
        const displayError = typeof errorMessage === 'string' && errorMessage ? errorMessage : 'An unknown error occurred.';
        statusText.textContent = `Error: ${displayError}`;
        setProcessingState(false);
    });

    function displayResults(logEntries, duration, wasOpened) {
        lastLogEntries = logEntries;
        resultsView.dataset.duration = duration;
        resultsView.dataset.wasOpened = wasOpened;
        
        const localeData = allLocaleData[currentLang] || {};
        
        const specialMessages = logEntries.filter(log => ['INFO', 'SUCCESS', 'FATAL'].includes(log.type));
        const fileLogs = logEntries.filter(log => !['INFO', 'SUCCESS', 'FATAL'].includes(log.type));

        const stats = { COPIED: 0, RENAMED: 0, ERROR: 0 };
        fileLogs.forEach(log => {
            if (stats[log.type] !== undefined) stats[log.type]++;
        });

        const durationSeconds = (duration / 1000).toFixed(2);
        const summaryText = `✅ ${stats.COPIED} ${localeData.resultsSummaryCopied || 'files copied'} | 🔵 ${stats.RENAMED} ${localeData.resultsSummaryRenamed || 'files renamed'} | ❌ ${stats.ERROR} ${localeData.resultsSummaryErrors || 'errors'}`;
        const durationText = `${localeData.resultsDuration || 'Duration:'} ${durationSeconds} ${localeData.resultsDurationSeconds || 'seconds'}`;
        resultsSummary.innerHTML = `${summaryText}<br>${durationText}`;
        
        logDetailsContainer.innerHTML = '';

        if (specialMessages.length > 0) {
            const specialMessagesDiv = document.createElement('div');
            specialMessages.forEach(msg => {
                const p = document.createElement('p');
                let messageText = localeData[msg.messageKey] || msg.messageKey;
                if (msg.vars) {
                    messageText = messageText.replace('{errorCount}', msg.vars.errorCount);
                }
                p.textContent = messageText;
                p.className = `special-message ${msg.type.toLowerCase()}`;
                specialMessagesDiv.appendChild(p);
            });
            logDetailsContainer.appendChild(specialMessagesDiv);
        }
        
        const groupedLogs = { COPIED: [], RENAMED: [], ERROR: [] };
        const conflictGroups = {};

        fileLogs.forEach(log => {
            if (groupedLogs[log.type]) {
                groupedLogs[log.type].push(log);
                if (log.type === 'RENAMED') {
                    if (!conflictGroups[log.originalName]) conflictGroups[log.originalName] = [];
                    conflictGroups[log.originalName].push(log);
                }
            }
        });

        const createLogSection = (count, typeKey, logs, typeClass, formatter) => {
            if (logs.length === 0) return;
            const details = document.createElement('details');
            details.className = typeClass;
            details.open = true;
            const summary = document.createElement('summary');
            summary.textContent = `${localeData[typeKey] || typeKey} (${count})`;
            const ul = document.createElement('ul');
            ul.className = 'log-list';
            if (typeKey === 'logRenamed') {
                 Object.keys(conflictGroups).forEach(originalName => {
                    const groupDetails = document.createElement('details');
                    groupDetails.className = 'conflict-group';
                    groupDetails.open = true;
                    const groupSummary = document.createElement('summary');
                    groupSummary.innerHTML = `Original Name: <code>${originalName}</code> (${conflictGroups[originalName].length} conflicts)`;
                    const conflictUl = document.createElement('ul');
                    conflictUl.className = 'log-list';
                    conflictGroups[originalName].forEach(log => {
                        const conflictLi = document.createElement('li');
                        conflictLi.innerHTML = formatter(log);
                        conflictUl.appendChild(conflictLi);
                    });
                    groupDetails.appendChild(groupSummary);
                    groupDetails.appendChild(conflictUl);
                    ul.appendChild(groupDetails);
                });
            } else {
                logs.forEach(log => {
                    const li = document.createElement('li');
                    li.innerHTML = formatter(log);
                    ul.appendChild(li);
                });
            }
            details.appendChild(summary);
            details.appendChild(ul);
            logDetailsContainer.appendChild(details);
        };

        createLogSection(stats.COPIED, 'logCopied', groupedLogs.COPIED, 'copied-log', log => `<code>${log.to}</code>`);
        createLogSection(stats.RENAMED, 'logRenamed', groupedLogs.RENAMED, 'renamed-log', log => `<code>${log.to}</code> <span style="color: var(--icon-color)">← from <code>${log.from}</code></span>`);
        createLogSection(stats.ERROR, 'logErrors', groupedLogs.ERROR, 'error-log', log => `File: <code>${log.from}</code><br>Error: ${log.message}`);
        
        openOutputFolderBtn.classList.toggle('hidden', wasOpened);
        
        mainView.classList.add('hidden');
        resultsView.classList.remove('hidden');
    }

    openLogBtn.addEventListener('click', () => { if (finalOutputPath) window.electronAPI.openPath(`${finalOutputPath}/documentation.md`); });
    
    openOutputFolderBtn.addEventListener('click', () => {
        if (finalParentPath) {
            window.electronAPI.openPath(finalParentPath);
        }
    });

    backToMainBtn.addEventListener('click', () => {
        resultsView.classList.add('hidden');
        mainView.classList.remove('hidden');
        resetMainView();
    });
    
    function updateStartButtonState() {
        let isReady = !!currentFolderPath;
        if (selectedMode === 'move' && !moveConfirmCheckbox.checked) {
            isReady = false;
        }
        startBtn.disabled = !isReady;
    }

    function setProcessingState(isProcessing) {
        selectFolderBtn.disabled = isProcessing;
        startBtn.disabled = isProcessing;
        statusArea.classList.toggle('hidden', !isProcessing);
        controlsWrapper.classList.toggle('hidden', isProcessing);
        if(isProcessing) {
            const localeData = allLocaleData[currentLang] || {};
            statusText.textContent = localeData.analyzingStatus || 'Analyzing folder structure...';
            progressBar.style.width = '0%';
            progressBar.classList.remove('success', 'error');
        }
    }

    function resetMainView() {
        setProcessingState(false);
        selectedFolderPath.innerHTML = ' ';
        currentFolderPath = null;
        finalOutputPath = null;
        finalParentPath = null;
        lastLogEntries = null;
        controlsWrapper.classList.add('hidden');
        moveWarning.classList.add('hidden');
        modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === 'copy'));
        selectedMode = 'copy';
        moveConfirmCheckbox.checked = false;
        zipCheckbox.checked = false;
        openFolderCheckbox.checked = false;
        updateStartButtonState();
    }

    setLanguage(initialLang);
});