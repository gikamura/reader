import { initializeStore, store } from './store.js';
import { renderApp, getDOM, showNotification, showConsolidatedUpdatePopup } from './ui.js';
import { getLastCheckTimestamp, setLastCheckTimestamp } from './cache.js';

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker registrado com sucesso:', registration);
            
            // Verifica se a API de Sincronização Periódica existe
            if ('periodicSync' in registration) {
                const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
                if (status.state === 'granted') {
                    await registration.periodicSync.register('check-for-updates', {
                        minInterval: 6 * 60 * 60 * 1000, // A cada 6 horas
                    });
                    console.log('Sincronização periódica registrada.');
                } else {
                    console.log('Permissão para sincronização periódica não concedida.');
                }
            }
        } catch (error) {
            console.error('Falha ao registrar o Service Worker:', error);
        }
    }
}

async function handleNotificationsPermission() {
    const { settings } = store.getState();
    if (!settings.notificationsEnabled) return;

    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

function setupEventListeners() {
    const dom = getDOM();

    dom.tabs.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab');
        if (tabButton) {
            const tabName = tabButton.dataset.tab;
            if (tabName === 'updates' && window.location.hash !== '#updates') {
                window.location.hash = 'updates';
            }
            store.setActiveTab(tabName);
        }
    });
    
    dom.markAllAsReadBtn.addEventListener('click', () => {
        store.markAllUpdatesAsRead();
    });

    let searchTimeout;
    dom.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            store.setSearchQuery(e.target.value);
            store.setCurrentPage(1);
        }, 300);
    });

    dom.paginationControls.addEventListener('click', (e) => {
        if (e.target.matches('.pagination-btn')) {
            store.setCurrentPage(parseInt(e.target.dataset.page, 10));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    document.getElementById('sort-select')?.addEventListener('change', (e) => {
        store.setLibrarySortOrder(e.target.value);
    });

    document.body.addEventListener('click', (e) => {
        const typeButton = e.target.closest('#type-filter-container .filter-btn');
        if (typeButton) store.setActiveTypeFilter(typeButton.dataset.type);

        const statusButton = e.target.closest('#status-filter-container .filter-btn');
        if (statusButton) store.setActiveStatusFilter(statusButton.dataset.status);
        
        const favoriteBtn = e.target.closest('.favorite-btn');
        if (favoriteBtn) {
            store.toggleFavorite(favoriteBtn.dataset.url);
            favoriteBtn.classList.add('pulsing');
            favoriteBtn.addEventListener('animationend', () => favoriteBtn.classList.remove('pulsing'), { once: true });
        }

        if (e.target.id === 'reload-page-btn') window.location.reload();

        const groupedNotification = e.target.closest('.notification-grouped');
        if (groupedNotification) {
            e.preventDefault();
            store.setActiveTab('updates');
        }
    });

    const backToTopButton = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        backToTopButton.classList.toggle('hidden', window.scrollY <= 300);
    });
    backToTopButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    dom.notificationsEnabledToggle.addEventListener('change', (e) => {
        store.setSettings({ notificationsEnabled: e.target.checked });
        if (e.target.checked) handleNotificationsPermission();
    });

    dom.popupsEnabledToggle.addEventListener('change', (e) => {
        store.setSettings({ popupsEnabled: e.target.checked });
    });

    // Roda a verificação de updates quando a aba fica visível
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForUpdatesOnFocus();
        }
    });

    // Checa a hash da URL ao carregar a página
    window.addEventListener('load', () => {
        if (window.location.hash === '#updates') {
            store.setActiveTab('updates');
        }
    });
}

// Esta função verifica as atualizações quando o usuário volta para a aba
async function checkForUpdatesOnFocus() {
    const { settings, allManga: oldMangaData } = store.getState();
    if (!settings.notificationsEnabled || oldMangaData.length === 0) return;

    console.log("Verificando atualizações ao focar na aba...");
    try {
        const worker = new Worker('./update-worker.js');
        worker.postMessage({ command: 'start-fetch' });
        
        worker.onmessage = async (event) => {
            if (event.data.type === 'complete') {
                const { data: newMangaData, updated } = event.data.payload;
                if(updated) {
                    const updates = await findNewChapterUpdates(oldMangaData, newMangaData);
                    if (updates.length > 0) {
                        store.addUpdates(updates);
                        showConsolidatedUpdatePopup(updates);
                        store.setAllManga(newMangaData);
                    }
                    await setLastCheckTimestamp(Date.now().toString());
                }
                worker.terminate();
            }
        };
    } catch (error) {
        console.error("Erro ao verificar atualizações em foco:", error);
    }
}

async function findNewChapterUpdates(oldManga, newManga) {
    const oldMangaMap = new Map(oldManga.map(m => [m.url, m]));
    const newUpdates = [];
    const lastCheckTimestamp = parseInt(await getLastCheckTimestamp() || '0');

    newManga.forEach(manga => {
        const oldVersion = oldMangaMap.get(manga.url);
        if (!oldVersion || !manga.chapters) return;

        const newChaptersInManga = [];
        for (const chapterKey in manga.chapters) {
            if (!oldVersion.chapters || !oldVersion.chapters[chapterKey]) {
                const newChapter = manga.chapters[chapterKey];
                const chapterTimestamp = parseInt(newChapter.last_updated) * 1000;
                if (chapterTimestamp > lastCheckTimestamp) {
                    newChaptersInManga.push({ title: newChapter.title || `Capítulo ${chapterKey}`, timestamp: chapterTimestamp });
                }
            }
        }
        if (newChaptersInManga.length > 0) {
            newUpdates.push({
                manga,
                newChapters: newChaptersInManga.sort((a,b) => b.timestamp - a.timestamp),
                timestamp: Date.now()
            });
        }
    });
    return newUpdates.sort((a, b) => b.timestamp - a.timestamp);
}

async function initializeApp() {
    const dom = getDOM();
    await initializeStore();
    store.subscribe(renderApp);
    setupEventListeners();
    renderApp();

    const updateWorker = new Worker('./update-worker.js');
    
    updateWorker.onmessage = async (event) => {
        const { type, payload } = event.data;
        switch (type) {
            case 'status-update':
                dom.subtitle.textContent = payload;
                break;
            case 'batch-processed':
                if (store.getState().isLoading) store.setLoading(false);
                store.addMangaToCatalog(payload);
                dom.subtitle.textContent = `${store.getState().allManga.length} obras carregadas...`;
                break;
            case 'complete':
                const { data, updated } = payload;
                if (data && store.getState().allManga.length === 0) {
                    store.setAllManga(data);
                }
                dom.subtitle.textContent = `${store.getState().allManga.length} obras no catálogo.`;
                if (updated) {
                    await setLastCheckTimestamp(Date.now().toString());
                    showNotification("O catálogo foi atualizado com sucesso!");
                }
                if(store.getState().isLoading) store.setLoading(false);
                updateWorker.terminate();
                break;
            case 'error':
                store.setError(`Erro no worker: ${payload}`);
                store.setLoading(false);
                updateWorker.terminate();
                break;
        }
    };
    
    updateWorker.postMessage({ command: 'start-fetch' });
    
    await registerServiceWorker();
    await handleNotificationsPermission();
}

document.addEventListener('DOMContentLoaded', initializeApp);
