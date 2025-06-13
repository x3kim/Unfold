let allLocaleData = {};
let currentLang = 'en'; // Default language
let lastLogEntries = null; // Store the last log entries to re-render results on language change

// This function applies the currently selected translations to the UI
function applyTranslations() {
    const localeData = allLocaleData[currentLang];
    if (!localeData) return;

    // Set text content for elements with data-i18n-key
    document.querySelectorAll('[data-i18n-key]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-key');
        if (localeData[key]) {
            elem.textContent = localeData[key];
        }
    });

    // Set tooltip text for elements with data-i18n-tooltip-key
    document.querySelectorAll('[data-i18n-tooltip-key]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-tooltip-key');
        if (localeData[key]) {
            elem.dataset.tooltip = localeData[key];
        }
    });
    
    // Set aria-label for accessibility
    document.querySelectorAll('[data-i18n-aria-key]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-aria-key');
        if (localeData[key]) {
            elem.setAttribute('aria-label', localeData[key]);
        }
    });
}

// This function handles setting a new language
function setLanguage(lang) {
    if (!allLocaleData[lang]) return; // Don't switch if language doesn't exist

    currentLang = lang;
    localStorage.setItem('user-lang', lang); // Save user's choice
    applyTranslations();

    // Update the active link in the language switcher
    document.querySelectorAll('.lang-link').forEach(link => {
        link.classList.toggle('active', link.dataset.lang === lang);
    });

    // If the results view is visible, re-render it to update its translations
    const resultsView = document.getElementById('results-view');
    if (!resultsView.classList.contains('hidden') && lastLogEntries) {
        displayResults(lastLogEntries);
    }
}

// Main logic starts after the DOM is loaded
window.addEventListener('DOMContentLoaded', async () => {
    // --- Initialization ---
    allLocaleData = await window.electronAPI.getAllLocales();
    
    const appVersion = await window.electronAPI.getAppVersion();
    document.getElementById('app-version').textContent = `v${appVersion}`;
    
    // ===================================================================
    // HIER IST DIE NEUE LOGIK: Theme laden
    // ===================================================================
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    const storedLang = localStorage.getItem('user-lang');
    const systemLang = navigator.language.split('-')[0];
    
    let initialLang = 'en';
    if (allLocaleData[storedLang]) {
        initialLang = storedLang;
    } else if (allLocaleData[systemLang]) {
        initialLang = systemLang;
    }
    
    // --- Element Selectors ---
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

    let currentFolderPath = null;
    let finalOutputPath = null;

    // --- Event Listeners ---
    themeSwitcher.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        // ===================================================================
        // HIER IST DIE NEUE LOGIK: Theme speichern
        // ===================================================================
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });

    document.querySelectorAll('.lang-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            setLanguage(link.dataset.lang);
        });
    });

    aboutLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.showAboutWindow(currentLang);
    });

    selectFolderBtn.addEventListener('click', async () => {
        currentFolderPath = await window.electronAPI.selectFolder();
        if (currentFolderPath) {
            selectedFolderPath.textContent = currentFolderPath;
            startBtn.disabled = false;
        }
    });

    startBtn.addEventListener('click', () => {
        if (currentFolderPath) {
            setProcessingState(true);
            window.electronAPI.startUnfold(currentFolderPath);
        }
    });
    
    // --- Process Updates ---
    window.electronAPI.onProgressUpdate(({ progress, file }) => {
        progressBar.style.width = `${progress}%`;
        const localeData = allLocaleData[currentLang];
        statusText.textContent = `[${progress}%] ${localeData.processingStatus} ${file}`;
    });

    window.electronAPI.onUnfoldComplete(({ outputPath, logEntries }) => {
        finalOutputPath = outputPath;
        displayResults(logEntries);
    });

    window.electronAPI.onUnfoldError((errorMessage) => {
        progressBar.style.width = '100%';
        progressBar.classList.add('error');
        statusText.textContent = `Error: ${errorMessage}`;
        setProcessingState(false);
    });

    // --- Results View Logic ---
    function displayResults(logEntries) {
        lastLogEntries = logEntries; // Store logs for re-rendering
        const localeData = allLocaleData[currentLang];
        const stats = { COPIED: 0, RENAMED: 0, ERROR: 0 };
        const groupedLogs = { COPIED: [], RENAMED: [], ERROR: [] };
        const conflictGroups = {};

        logEntries.forEach(log => {
            if (stats[log.type] !== undefined) {
                stats[log.type]++;
                groupedLogs[log.type].push(log);
                
                if (log.type === 'RENAMED') {
                    if (!conflictGroups[log.originalName]) {
                        conflictGroups[log.originalName] = [];
                    }
                    conflictGroups[log.originalName].push(log);
                }
            }
        });

        resultsSummary.textContent = `✅ ${stats.COPIED} ${localeData.resultsSummaryCopied} | 🔵 ${stats.RENAMED} ${localeData.resultsSummaryRenamed} | ❌ ${stats.ERROR} ${localeData.resultsSummaryErrors}`;
        logDetailsContainer.innerHTML = '';

        const createLogSection = (count, typeKey, logs, typeClass, formatter) => {
            if (logs.length === 0) return;
            
            const details = document.createElement('details');
            details.className = typeClass;
            details.open = true;

            const summary = document.createElement('summary');
            summary.textContent = `${localeData[typeKey]} (${count})`;
            
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

        createLogSection(stats.COPIED, 'logCopied', groupedLogs.COPIED, 'copied-log',
            log => `<code>${log.to}</code>`
        );
        createLogSection(stats.RENAMED, 'logRenamed', groupedLogs.RENAMED, 'renamed-log',
            log => `<code>${log.to}</code> <span style="color: var(--icon-color)">← from <code>${log.from}</code></span>`
        );
        createLogSection(stats.ERROR, 'logErrors', groupedLogs.ERROR, 'error-log',
            log => `File: <code>${log.from}</code><br>Error: ${log.message}`
        );
        
        mainView.classList.add('hidden');
        resultsView.classList.remove('hidden');
    }

    // --- Results View Buttons ---
    openLogBtn.addEventListener('click', () => {
        if (finalOutputPath) {
            window.electronAPI.openPath(`${finalOutputPath}/documentation.md`);
        }
    });

    backToMainBtn.addEventListener('click', () => {
        resultsView.classList.add('hidden');
        mainView.classList.remove('hidden');
        resetMainView();
    });
    
    // --- Helper Functions ---
    function setProcessingState(isProcessing) {
        selectFolderBtn.disabled = isProcessing;
        startBtn.disabled = isProcessing;
        statusArea.classList.toggle('hidden', !isProcessing);
        if(isProcessing) {
            const localeData = allLocaleData[currentLang];
            statusText.textContent = localeData.analyzingStatus;
            progressBar.style.width = '0%';
            progressBar.classList.remove('success', 'error');
        }
    }

    function resetMainView() {
        setProcessingState(false);
        startBtn.disabled = true;
        selectedFolderPath.innerHTML = ' '; 
        currentFolderPath = null;
        finalOutputPath = null;
        lastLogEntries = null; // Clear stored logs
    }

    // Finally, set the initial language for the very first time
    setLanguage(initialLang);
});