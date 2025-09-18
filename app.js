import { initializeStore, store } from './store.js';
import { renderApp, getDOM, showNotification, showConsolidatedUpdatePopup } from './ui.js';
import { getLastCheckTimestamp, setLastCheckTimestamp } from './cache.js';
import './lazy-loader.js';
import { SmartDebounce, SmartAutocomplete } from './smart-debounce.js';
import { GestureNavigationManager } from './touch-gestures.js';
import { analytics } from './local-analytics.js';

// Configurar autocomplete
let autocomplete = null;
const setupAutocomplete = () => {
    const dom = getDOM();
    const { allManga } = store.getState();
    if (allManga.length > 0 && !autocomplete) {
        autocomplete = new SmartAutocomplete(dom.searchInput, allManga, {
            maxSuggestions: 8,
            showRecentSearches: true,
            onSelect: (suggestion) => {
                // Analytics: track autocomplete selection
                analytics?.trackUserInteraction('autocomplete', 'select', {
                    suggestionType: suggestion.type,
                    query: suggestion.text
                });
            }
        });
    } else if (allManga.length > 0 && autocomplete) {
        autocomplete.updateDataSource(allManga);
    }
};

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // ADICIONADO: { type: 'module' }
            const registration = await navigator.serviceWorker.register('./sw.js', { type: 'module' });
            console.log('Service Worker registrado com sucesso:', registration);
            
            if ('periodicSync' in registration) {
                const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
                if (status.state === 'granted') {
                    await registration.periodicSync.register('check-for-updates', {
                        minInterval: 6 * 60 * 60 * 1000,
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

            // Analytics: track tab navigation
            analytics?.trackPageView(tabName);
        }
    });
    
    dom.markAllAsReadBtn.addEventListener('click', () => {
        store.markAllUpdatesAsRead();

        // Analytics: track mark all as read
        analytics?.trackUserInteraction('mark_all_read_btn', 'click');
    });

    // Sistema de busca inteligente com debounce
    const smartSearchDebounce = new SmartDebounce(
        (query) => {
            store.setSearchQuery(query);
            store.setCurrentPage(1);
        },
        {
            wait: 250,
            minLength: 0, // Permitir busca vazia para limpar
            maxWait: 1000,
            immediate: false
        }
    );

    dom.searchInput.addEventListener('input', (e) => {
        smartSearchDebounce.execute(e.target.value);

        // Analytics: track search (with debounce)
        if (e.target.value.length >= 2) {
            setTimeout(() => {
                analytics?.trackSearch(e.target.value, 0, 'search_input');
            }, 500);
        }
    });

    // Chamar função de configuração de autocomplete
    setupAutocomplete();

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
            const mangaUrl = favoriteBtn.dataset.url;
            const { favorites } = store.getState();
            const action = favorites.has(mangaUrl) ? 'remove' : 'add';

            store.toggleFavorite(mangaUrl);
            favoriteBtn.classList.add('pulsing');
            favoriteBtn.addEventListener('animationend', () => favoriteBtn.classList.remove('pulsing'), { once: true });

            // Analytics: track favorite action
            analytics?.trackFavoriteAction(mangaUrl, action);
        }

        if (e.target.id === 'reload-page-btn') window.location.reload();

        const groupedNotification = e.target.closest('.notification-grouped');
        if (groupedNotification) {
            e.preventDefault();
            store.setActiveTab('updates');
        }

        // Analytics: track manga view
        const mangaLink = e.target.closest('a[href]');
        if (mangaLink && mangaLink.href.includes('cubari.moe')) {
            analytics?.trackMangaView(mangaLink.href, mangaLink.querySelector('h3')?.textContent || 'Unknown', 'card_click');
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

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForUpdatesOnFocus();
        }
    });

    window.addEventListener('load', () => {
        if (window.location.hash === '#updates') {
            store.setActiveTab('updates');
        }
    });
}

async function checkForUpdatesOnFocus() {
    const { settings, allManga: oldMangaData } = store.getState();
    if (!settings.notificationsEnabled || oldMangaData.length === 0) return;

    console.log("Verificando atualizações ao focar na aba...");
    try {
        const worker = new Worker('./update-worker.js', { type: 'module' });
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

    // Configurar gestos touch
    let gestureManager = null;
    if ('ontouchstart' in window) {
        gestureManager = new GestureNavigationManager(store);
    }

    // ADICIONADO: { type: 'module' }
    const updateWorker = new Worker('./update-worker.js', { type: 'module' });
    
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

                // Configurar autocomplete conforme dados carregam
                setupAutocomplete();
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

                // Configurar autocomplete final
                setupAutocomplete();

                updateWorker.terminate();
                break;
            case 'error':
                store.setError(`Erro no worker: ${payload}`);
                store.setLoading(false);
                updateWorker.terminate();

                // Analytics: track worker error
                analytics?.trackError(new Error(payload), {
                    context: 'update_worker',
                    severity: 'error'
                });
                break;
        }
    };
    
    updateWorker.postMessage({ command: 'start-fetch' });
    
    await registerServiceWorker();
    await handleNotificationsPermission();
}

document.addEventListener('DOMContentLoaded', initializeApp);
