import { initializeStore, store } from './store.js';
import { renderApp, getDOM, showNotification, showConsolidatedUpdatePopup, loadingManager } from './ui.js';
import { getLastCheckTimestamp, setLastCheckTimestamp, setMangaCache, setMangaCacheVersion } from './cache.js';
import './lazy-loader.js';
import { SmartDebounce, SmartAutocomplete } from './smart-debounce.js';
import { errorNotificationManager } from './error-handler.js';
import { GestureNavigationManager } from './touch-gestures.js';
import { analytics } from './local-analytics.js';

// Sistema global de debug
window.GIKAMURA_DEBUG = localStorage.getItem('gikamura_debug') === 'true';

// Helper para alternar debug
window.toggleGikamuraDebug = () => {
    window.GIKAMURA_DEBUG = !window.GIKAMURA_DEBUG;
    localStorage.setItem('gikamura_debug', window.GIKAMURA_DEBUG.toString());
    console.log(`Debug ${window.GIKAMURA_DEBUG ? 'ativado' : 'desativado'}`);
    return window.GIKAMURA_DEBUG;
};

// Sistema integrado de busca e autocomplete
let autocomplete = null;
let searchDebounce = null;
let isSearchSystemInitialized = false;

// Debug helper
const debugLog = (message, data = {}) => {
    if (window.GIKAMURA_DEBUG) {
        console.log(`[GIKAMURA_DEBUG] ${message}`, data);
    }
};

const setupIntegratedSearchSystem = () => {
    if (isSearchSystemInitialized) {
        debugLog('Sistema de busca já inicializado, ignorando');
        return;
    }

    const dom = getDOM();
    const { allManga } = store.getState();

    if (allManga.length === 0) {
        debugLog('Dados ainda não carregados, aguardando');
        return;
    }

    try {
        // Limpar sistema anterior se existir
        if (autocomplete) {
            autocomplete.destroy();
            autocomplete = null;
        }
        if (searchDebounce) {
            searchDebounce.cancel();
            searchDebounce = null;
        }

        // Remover event listeners anteriores do input de busca
        const newInput = dom.searchInput.cloneNode(true);
        dom.searchInput.parentNode.replaceChild(newInput, dom.searchInput);
        dom.searchInput = newInput;

        // Configurar sistema de busca principal com debounce
        searchDebounce = new SmartDebounce(
            (query) => {
                debugLog('Executando busca principal', { query });
                store.setSearchQuery(query);
                store.setCurrentPage(1);

                // Analytics
                if (query.length >= 2) {
                    analytics?.trackSearch(query, 0, 'search_input');
                }
            },
            {
                wait: 250,
                minLength: 0,
                maxWait: 1000,
                immediate: false
            }
        );

        // Configurar autocomplete de forma isolada
        autocomplete = new SmartAutocomplete(dom.searchInput, allManga, {
            maxSuggestions: 8,
            showRecentSearches: true,
            onSelect: (suggestion) => {
                debugLog('Autocomplete selecionado', { suggestion });
                // Trigger busca principal através do debounce
                searchDebounce.execute(suggestion.text);

                // Analytics
                analytics?.trackUserInteraction('autocomplete', 'select', {
                    suggestionType: suggestion.type,
                    query: suggestion.text
                });
            },
            // Coordenar com sistema principal
            onInput: (query) => {
                debugLog('Input no autocomplete', { query });
                searchDebounce.execute(query);
            }
        });

        isSearchSystemInitialized = true;
        debugLog('Sistema de busca integrado inicializado com sucesso');

    } catch (error) {
        console.error('Erro ao configurar sistema de busca:', error);
        debugLog('Erro na configuração do sistema de busca', { error: error.message, stack: error.stack });

        errorNotificationManager.showError(
            'Erro no Sistema de Busca',
            'O sistema de busca encontrou um problema. Recarregue a página se necessário.',
            'warning'
        );

        // Analytics: track error
        analytics?.trackError(error, {
            context: 'search_system_setup',
            severity: 'warning'
        });
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

            // Atualizar atributos de acessibilidade
            dom.tabs.querySelectorAll('.tab').forEach(tab => {
                tab.setAttribute('aria-selected', 'false');
                tab.classList.remove('active');
            });

            tabButton.setAttribute('aria-selected', 'true');
            tabButton.classList.add('active');

            if (tabName === 'updates' && window.location.hash !== '#updates') {
                window.location.hash = 'updates';
            }

            store.setActiveTab(tabName);

            // Focar no conteúdo principal para navegação por teclado
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.focus();
            }

            // Feedback para screen readers
            loadingManager.showFeedback(`Navegou para ${tabButton.textContent.trim()}`, 'info', 2000);

            // Analytics: track tab navigation
            analytics?.trackPageView(tabName);
            debugLog('Tab navegada', { tabName, timestamp: Date.now() });
        }
    });
    
    dom.markAllAsReadBtn.addEventListener('click', () => {
        store.markAllUpdatesAsRead();

        // Analytics: track mark all as read
        analytics?.trackUserInteraction('mark_all_read_btn', 'click');
    });

    // Sistema de busca será configurado após carregamento dos dados
    // Nota: removido o event listener direto para evitar conflitos

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

    debugLog("Verificando atualizações ao focar na aba");
    try {
        const worker = new Worker('./update-worker.js');
        let workerTimeout;

        // Timeout para Worker que não responde
        workerTimeout = setTimeout(() => {
            debugLog('Worker de atualização timeout');
            worker.terminate();
            errorNotificationManager.showError(
                'Timeout na Verificação',
                'A verificação de atualizações demorou muito. Tente novamente.',
                'warning',
                3000
            );
        }, 30000); // 30 segundos

        worker.postMessage({ command: 'start-fetch' });

        worker.onmessage = async (event) => {
            try {
                clearTimeout(workerTimeout);

                if (event.data.type === 'complete') {
                    const { data: newMangaData, updated } = event.data.payload;
                    if(updated) {
                        const updates = await findNewChapterUpdates(oldMangaData, newMangaData);
                        if (updates.length > 0) {
                            store.addUpdates(updates);
                            showConsolidatedUpdatePopup(updates);
                            store.setAllManga(newMangaData);
                            debugLog('Atualizações processadas', { count: updates.length });
                        }
                        await setLastCheckTimestamp(Date.now().toString());
                    }
                }
                worker.terminate();
            } catch (error) {
                debugLog('Erro no processamento de updates', { error: error.message });
                worker.terminate();
                throw error;
            }
        };

        worker.onerror = (error) => {
            clearTimeout(workerTimeout);
            debugLog('Erro no Worker de atualização', { error: error.message });
            errorNotificationManager.showError(
                'Erro na Verificação',
                'Falha ao verificar atualizações. Verifique sua conexão.',
                'error',
                4000
            );
            worker.terminate();
        };

    } catch (error) {
        console.error("Erro ao verificar atualizações em foco:", error);
        debugLog('Erro crítico na verificação de atualizações', { error: error.message, stack: error.stack });

        errorNotificationManager.showError(
            'Erro Crítico',
            'Falha ao inicializar verificação de atualizações.',
            'error'
        );

        // Analytics: track error
        analytics?.trackError(error, {
            context: 'check_updates_on_focus',
            severity: 'error'
        });
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

    // Worker compatível com importScripts
    const updateWorker = new Worker('./update-worker.js');
    
    // Timeout para Worker principal
    let workerMainTimeout = setTimeout(() => {
        debugLog('Worker principal timeout');
        updateWorker.terminate();
        store.setError('Timeout ao carregar dados. Recarregue a página.');
        store.setLoading(false);

        errorNotificationManager.showError(
            'Timeout no Carregamento',
            'O carregamento demorou muito. Recarregue a página.',
            'error'
        );
    }, 60000); // 1 minuto

    updateWorker.onmessage = async (event) => {
        try {
            const { type, payload } = event.data;
            debugLog('Worker principal message', { type, payload: typeof payload });

            switch (type) {
                case 'status-update':
                    dom.subtitle.textContent = payload;
                    break;
                case 'batch-processed':
                    if (store.getState().isLoading) store.setLoading(false);
                    store.addMangaToCatalog(payload);

                    const currentCount = store.getState().allManga.length;
                    loadingManager.showFeedback(`${currentCount} obras carregadas`, 'info', 2000);
                    dom.subtitle.textContent = `${currentCount} obras carregadas...`;

                    // Configurar sistema integrado de busca
                    setupIntegratedSearchSystem();
                    break;
                case 'complete':
                    clearTimeout(workerMainTimeout);
                    const { data, updated, version } = payload;

                    if (data && store.getState().allManga.length === 0) {
                        store.setAllManga(data);

                        // Gerenciar cache no contexto principal (Worker não tem localStorage)
                        if (updated && version) {
                            try {
                                setMangaCache(data);
                                setMangaCacheVersion(version);
                                debugLog('Cache atualizado', { version, itemCount: data.length });
                            } catch (cacheError) {
                                debugLog('Erro ao salvar cache', { error: cacheError.message });
                                errorNotificationManager.showError(
                                    'Erro no Cache',
                                    'Não foi possível salvar dados localmente.',
                                    'warning',
                                    3000
                                );
                            }
                        }
                    }

                    dom.subtitle.textContent = `${store.getState().allManga.length} obras no catálogo.`;

                    if (updated) {
                        await setLastCheckTimestamp(Date.now().toString());
                        showNotification("O catálogo foi atualizado com sucesso!");
                        loadingManager.showFeedback("Catálogo atualizado com sucesso!", 'success', 4000);
                    } else {
                        loadingManager.showFeedback("Catálogo carregado do cache", 'info', 3000);
                    }

                    if(store.getState().isLoading) store.setLoading(false);

                    // Configurar sistema integrado de busca final
                    setupIntegratedSearchSystem();

                    updateWorker.terminate();
                    break;
                case 'error':
                    clearTimeout(workerMainTimeout);
                    debugLog('Erro do Worker principal', { error: payload });

                    store.setError(`Erro no carregamento: ${payload}`);
                    store.setLoading(false);
                    updateWorker.terminate();

                    errorNotificationManager.showError(
                        'Erro no Carregamento',
                        'Falha ao carregar dados. Verifique sua conexão.',
                        'error'
                    );

                    // Analytics: track worker error
                    analytics?.trackError(new Error(payload), {
                        context: 'update_worker',
                        severity: 'error'
                    });
                    break;
            }
        } catch (error) {
            clearTimeout(workerMainTimeout);
            debugLog('Erro ao processar mensagem do Worker', { error: error.message, stack: error.stack });

            store.setError('Erro interno ao processar dados');
            store.setLoading(false);
            updateWorker.terminate();

            errorNotificationManager.showCriticalError(
                'Erro interno ao processar dados do servidor'
            );

            // Analytics: track critical error
            analytics?.trackError(error, {
                context: 'worker_message_processing',
                severity: 'critical'
            });
        }
    };

    updateWorker.onerror = (error) => {
        clearTimeout(workerMainTimeout);
        debugLog('Erro crítico no Worker principal', { error: error.message });

        store.setError('Falha crítica no carregamento');
        store.setLoading(false);
        updateWorker.terminate();

        errorNotificationManager.showCriticalError(
            'Falha crítica no sistema de carregamento'
        );
    };
    
    updateWorker.postMessage({ command: 'start-fetch' });
    
    await registerServiceWorker();
    await handleNotificationsPermission();
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Export para compatibilidade com modules (se necessário)
export { initializeApp, debugLog };
