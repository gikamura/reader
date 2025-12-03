import { initializeStore, store, fetchAndDisplayScanWorks } from './store.js';
import { renderApp, getDOM, showNotification, showConsolidatedUpdatePopup, loadingManager, updateFaviconBadge } from './ui.js';
import { getLastCheckTimestamp, setLastCheckTimestamp, setMangaCache, setMangaCacheVersion, getMangaCache, getMangaCacheVersion, saveScansListToCache, loadScansListFromCache, getMetadata, setMetadata } from './cache.js';
import { SCANS_INDEX_URL, INDEX_URL, UPDATE_CHECK_INTERVAL_MS } from './constants.js';

import { SmartDebounce, SmartAutocomplete } from './smart-debounce.js';
import { searchEngine, keyboardShortcuts, parseQueryFilters } from './search-engine.js';
import { errorNotificationManager } from './error-handler.js';
import { GestureNavigationManager } from './touch-gestures.js';
import { analytics } from './local-analytics.js';

import './shared-utils.js';

// Sistema global de debug
window.GIKAMURA_DEBUG = localStorage.getItem('gikamura_debug') === 'true';

// Intervalo de verificação periódica
let updateCheckInterval = null;

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

// Sistema de autocomplete para scans
let scanAutocomplete = null;
let scanSearchDebounce = null;
let currentScanUrl = null; // Track qual scan tem autocomplete ativo

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
    const { allManga, favorites } = store.getState();

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

        // Registrar fonte de dados no SearchEngine
        searchEngine.registerDataSource('library', () => {
            const state = store.getState();
            return state.allManga.map(m => ({
                ...m,
                isFavorite: state.favorites.has(m.url)
            }));
        });

        // Configurar sistema de busca principal com debounce adaptativo
        searchDebounce = new SmartDebounce(
            (query) => {
                debugLog('Executando busca principal', { query });
                
                // Extrair filtros inline da query
                const { filters, query: cleanQuery } = parseQueryFilters(query);
                
                // Aplicar filtros automaticamente se detectados
                if (filters.type && filters.type !== 'all') {
                    store.setActiveTypeFilter(filters.type);
                }
                if (filters.status && filters.status !== 'all') {
                    store.setActiveStatusFilter(filters.status);
                }
                
                // Atualizar query de busca (sem os filtros inline)
                store.setSearchQuery(cleanQuery || query);
                store.setCurrentPage(1);

                // Adicionar ao histórico do SearchEngine
                if (query.length >= 2) {
                    const results = searchEngine.search(query, { sources: ['library'] });
                    searchEngine.addToHistory(query, results.results.length);
                    analytics?.trackSearch(query, results.results.length, 'search_input');
                }
            },
            {
                wait: 150, // Mais rápido para busca instantânea
                minLength: 0,
                maxWait: 500,
                immediate: false
            }
        );

        // Configurar autocomplete de forma isolada
        autocomplete = new SmartAutocomplete(dom.searchInput, allManga, {
            maxSuggestions: 10, // Mais sugestões
            showRecentSearches: true,
            onSelect: (suggestion) => {
                debugLog('Autocomplete selecionado', { suggestion });
                searchDebounce.execute(suggestion.text);

                analytics?.trackUserInteraction('autocomplete', 'select', {
                    suggestionType: suggestion.type,
                    query: suggestion.text
                });
            },
            onInput: (query) => {
                debugLog('Input no autocomplete', { query });
                
                // Busca instantânea para queries longas
                if (searchEngine.shouldSearchInstantly(query)) {
                    searchDebounce.execute(query);
                } else {
                    searchDebounce.execute(query);
                }
            }
        });

        // Configurar atalhos de teclado
        keyboardShortcuts.on('focusSearch', () => {
            dom.searchInput.focus();
            dom.searchInput.select();
        });
        
        keyboardShortcuts.on('clearSearch', () => {
            dom.searchInput.value = '';
            store.setSearchQuery('');
            store.setCurrentPage(1);
        });
        
        keyboardShortcuts.on('blurSearch', () => {
            if (autocomplete) {
                autocomplete.hide();
            }
        });

        isSearchSystemInitialized = true;
        debugLog('Sistema de busca avançado inicializado com sucesso');

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

// Sistema de autocomplete para busca nas scans
const setupScanSearchAutocomplete = () => {
    const scanSearchInput = document.getElementById('scan-search-input');
    const { scanWorks, selectedScan } = store.getState();

    if (!scanSearchInput || scanWorks.length === 0 || !selectedScan) {
        debugLog('Input de busca ou obras das scans não disponíveis');
        return;
    }

    // Verificar se já está configurado para esta scan
    const scanUrl = selectedScan.url || JSON.stringify(selectedScan.scan_info);
    if (currentScanUrl === scanUrl && scanAutocomplete) {
        debugLog('Autocomplete já configurado para esta scan, ignorando');
        return;
    }

    try {
        // Limpar autocomplete anterior se existir
        if (scanAutocomplete) {
            scanAutocomplete.destroy();
            scanAutocomplete = null;
        }
        if (scanSearchDebounce) {
            scanSearchDebounce.cancel();
            scanSearchDebounce = null;
        }

        // Atualizar scan atual
        currentScanUrl = scanUrl;

        // Configurar debounce para busca nas scans
        scanSearchDebounce = new SmartDebounce(
            (query) => {
                debugLog('Executando busca em scan', { query });
                store.setScanSearchQuery(query);

                // Analytics
                if (query.length >= 2) {
                    analytics?.trackSearch(query, 0, 'scan_search_input');
                }
            },
            {
                wait: 250,
                minLength: 0,
                maxWait: 1000,
                immediate: false
            }
        );

        // Configurar autocomplete para scans
        scanAutocomplete = new SmartAutocomplete(scanSearchInput, scanWorks, {
            maxSuggestions: 8,
            showRecentSearches: false, // Desabilitar histórico para scans
            onSelect: (suggestion) => {
                debugLog('Autocomplete de scan selecionado', { suggestion });
                scanSearchDebounce.execute(suggestion.text);

                // Analytics
                analytics?.trackUserInteraction('scan_autocomplete', 'select', {
                    suggestionType: suggestion.type,
                    query: suggestion.text
                });
            },
            onInput: (query) => {
                debugLog('Input no autocomplete de scan', { query });
                scanSearchDebounce.execute(query);
            }
        });

        debugLog('Autocomplete de scans inicializado com sucesso', { worksCount: scanWorks.length });

    } catch (error) {
        console.error('Erro ao configurar autocomplete de scans:', error);
        debugLog('Erro na configuração do autocomplete de scans', { error: error.message });
    }
};

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // Service Worker clássico (não é módulo ES6)
            const registration = await navigator.serviceWorker.register('./sw.js');
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
    const { fetchWithTimeout } = window.SharedUtils; // ADICIONAR ESTA LINHA AQUI TAMBÉM

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

    // NOVO: Adicionar manipulador de eventos para a página de Scans
    dom.scansContent.addEventListener('click', async (e) => {
        const scanCard = e.target.closest('.scan-card');
        const backButton = e.target.closest('#back-to-scans-btn');
        const favoriteBtn = e.target.closest('.favorite-btn');
        const paginationBtn = e.target.closest('.pagination-btn');

        if (scanCard) {
            const url = scanCard.dataset.url;
            // A action fetchAndDisplayScanWorks agora orquestra todo o processo
            fetchAndDisplayScanWorks(url);
        }

        if (backButton) {
            // Limpar autocomplete ao voltar para lista de scans
            if (scanAutocomplete) {
                scanAutocomplete.destroy();
                scanAutocomplete = null;
            }
            if (scanSearchDebounce) {
                scanSearchDebounce.cancel();
                scanSearchDebounce = null;
            }
            currentScanUrl = null;

            store.clearSelectedScan();
        }

        if (favoriteBtn) {
            e.preventDefault();
            e.stopPropagation(); // Evitar abrir o link ao clicar

            const mangaUrl = favoriteBtn.dataset.url;
            const { favorites } = store.getState();
            const action = favorites.has(mangaUrl) ? 'remove' : 'add';

            store.toggleFavorite(mangaUrl);

            favoriteBtn.classList.add('pulsing');
            favoriteBtn.addEventListener('animationend', () => favoriteBtn.classList.remove('pulsing'), { once: true });

            // Analytics: track favorite action
            analytics?.trackFavoriteAction(mangaUrl, action);
        }

        if (paginationBtn) {
            const page = parseInt(paginationBtn.dataset.page, 10);
            store.setScanWorksCurrentPage(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // O event listener de busca nas scans agora é gerenciado pelo SmartAutocomplete
    // configurado via setupScanSearchAutocomplete() quando as obras são renderizadas

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

    // Configurar autocomplete quando obras das scans forem renderizadas
    window.addEventListener('scan-works-rendered', () => {
        debugLog('Evento scan-works-rendered recebido, configurando autocomplete');
        setupScanSearchAutocomplete();
    });

    dom.notificationsEnabledToggle.addEventListener('change', (e) => {
        store.setSettings({ notificationsEnabled: e.target.checked });
        if (e.target.checked) {
            handleNotificationsPermission();
            startPeriodicUpdateCheck();
        } else {
            stopPeriodicUpdateCheck();
        }
    });

    dom.popupsEnabledToggle.addEventListener('change', (e) => {
        store.setSettings({ popupsEnabled: e.target.checked });
    });

    // Controle de visibilidade: pausar/retomar verificação periódica
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForUpdatesOnFocus();
            // Retomar verificação periódica
            const { settings } = store.getState();
            if (settings.notificationsEnabled && !updateCheckInterval) {
                startPeriodicUpdateCheck();
            }
        } else {
            // Pausar verificação quando aba não está visível (economia de recursos)
            stopPeriodicUpdateCheck();
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
        }, 120000); // 2 minutos

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
        
        // Detectar obra completamente nova (não existia antes)
        if (!oldVersion) {
            newUpdates.push({
                type: 'new_work',
                manga,
                newChapters: [],
                timestamp: Date.now()
            });
            return;
        }
        
        if (!manga.chapters) return;

        // OTIMIZADO: Usar apenas timestamp para detectar capítulos novos/atualizados
        // Não precisa comparar chaves - se last_updated > lastCheck, é novidade
        const newChaptersInManga = [];
        for (const chapterKey in manga.chapters) {
            const chapter = manga.chapters[chapterKey];
            const chapterTimestamp = parseInt(chapter.last_updated) * 1000;
            
            // Capítulo é novo se timestamp > última verificação
            if (chapterTimestamp > lastCheckTimestamp) {
                newChaptersInManga.push({ 
                    title: chapter.title || `Capítulo ${chapterKey}`, 
                    timestamp: chapterTimestamp,
                    key: chapterKey
                });
            }
        }
        
        if (newChaptersInManga.length > 0) {
            newUpdates.push({
                type: 'new_chapters',
                manga,
                newChapters: newChaptersInManga.sort((a, b) => b.timestamp - a.timestamp),
                timestamp: Date.now()
            });
        }
    });
    
    return newUpdates.sort((a, b) => b.timestamp - a.timestamp);
}

// NOVO: Função para buscar o índice de scans
async function fetchScansIndex() {
    const { fetchWithTimeout } = window.SharedUtils;

    try {
        // Etapa 0: Tentar carregar do cache primeiro
        const cachedScans = await loadScansListFromCache();
        if (cachedScans && cachedScans.length > 0) {
            console.log(`✅ ${cachedScans.length} scans carregadas do cache`);
            store.setScansList(cachedScans);
            // Continuar buscando dados frescos em background
        }

        // Etapa 1: Buscar índice fresco
        const response = await fetchWithTimeout(SCANS_INDEX_URL);
        const index = await response.json();

        // Etapa 2: Buscar informações de cada scan
        const scanPromises = Object.values(index).map(async (scanUrl) => {
            const scanResponse = await fetchWithTimeout(scanUrl);
            const scanData = await scanResponse.json();
            return {
                scan_info: scanData.scan_info,
                url: scanUrl
            };
        });

        const scansList = await Promise.all(scanPromises);

        // Etapa 3: Atualizar store e salvar no cache
        store.setScansList(scansList);
        await saveScansListToCache(scansList);
        console.log(`💾 ${scansList.length} scans salvas no cache`);

    } catch (error) {
        console.error('Falha ao buscar índice de scans:', error);

        // Se falhar e não tem cache, define vazio
        const cachedScans = await loadScansListFromCache();
        if (!cachedScans || cachedScans.length === 0) {
            store.setScansList([]);
        }
    }
}

async function initializeApp() {
    const dom = getDOM();
    await initializeStore();
    store.subscribe(renderApp);
    setupEventListeners();
    renderApp();

    // Iniciar a busca do índice de scans em paralelo
    fetchScansIndex();

    // Configurar gestos touch
    let gestureManager = null;
    if ('ontouchstart' in window) {
        gestureManager = new GestureNavigationManager(store);
    }

    // Tentar carregar do cache primeiro
    const cachedManga = await getMangaCache();
    const localVersion = await getMangaCacheVersion();
    const hasCachedData = cachedManga && cachedManga.length > 0 && localVersion;

    if (hasCachedData) {
        // Cache existe - carregar imediatamente
        debugLog('Carregando do cache', { items: cachedManga.length, version: localVersion });
        
        store.setAllManga(cachedManga);
        store.setLoading(false);
        dom.subtitle.textContent = `${cachedManga.length} obras no catálogo`;
        
        // Configurar sistema de busca
        setupIntegratedSearchSystem();

        // Registrar Service Worker e permissões
        await registerServiceWorker();
        await handleNotificationsPermission();

        // Verificar se há nova versão em background (baseado no lastUpdated do metadata)
        checkForUpdatesInBackground();
        
        // Iniciar verificação periódica
        const { settings } = store.getState();
        if (settings.notificationsEnabled) {
            startPeriodicUpdateCheck();
        }
        
        return;
    }

    // Sem cache - carregar via Worker
    debugLog('Sem cache, carregando via Worker');
    
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
    }, 180000); // 3 minutos

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
                    // Atualizar apenas o subtitle sem toast de feedback
                    dom.subtitle.textContent = `Carregando... ${currentCount} obras`;
                    break;
                case 'complete':
                    clearTimeout(workerMainTimeout);
                    const { data, updated, version } = payload;

                    // Se recebemos dados no complete e o store está vazio, usar esses dados
                    // (caso contrário, os batches já popularam o store)
                    if (data && data.length > 0 && store.getState().allManga.length === 0) {
                        store.setAllManga(data);
                    }

                    // SEMPRE salvar no cache quando há atualização, independente de como os dados foram carregados
                    if (updated && version) {
                        try {
                            const dataToCache = store.getState().allManga;
                            await setMangaCache(dataToCache);
                            await setMangaCacheVersion(version);
                            debugLog('Cache atualizado', { version, itemCount: dataToCache.length });
                        } catch (cacheError) {
                            debugLog('Erro ao salvar cache', { error: cacheError.message });
                            console.error('Erro ao salvar cache:', cacheError);
                            errorNotificationManager.showError(
                                'Erro no Cache',
                                'Não foi possível salvar dados localmente.',
                                'warning',
                                3000
                            );
                        }
                    }

                    const totalLoaded = store.getState().allManga.length;
                    dom.subtitle.textContent = `${totalLoaded} obras no catálogo`;

                    if (updated) {
                        await setLastCheckTimestamp(Date.now().toString());
                        // Salvar lastUpdated do catálogo para comparação futura
                        await setMetadata('catalogLastUpdated', Date.now().toString());
                        debugLog('Catálogo atualizado', { total: totalLoaded });
                    }

                    if(store.getState().isLoading) store.setLoading(false);

                    // Configurar sistema integrado de busca final
                    setupIntegratedSearchSystem();
                    
                    // Iniciar verificação periódica
                    const { settings } = store.getState();
                    if (settings.notificationsEnabled) {
                        startPeriodicUpdateCheck();
                    }

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

// Verificar atualizações em background comparando lastUpdated do metadata
async function checkForUpdatesInBackground(showIndicator = true) {
    debugLog('Verificando atualizações em background');
    
    try {
        const { fetchWithTimeout } = window.SharedUtils;
        
        // Buscar apenas o índice para comparar (requisição leve ~50KB)
        const response = await fetchWithTimeout(INDEX_URL, { timeout: 10000 });
        const indexData = await response.json();
        
        const remoteLastUpdated = indexData.metadata?.lastUpdated;
        const remoteVersion = indexData.metadata?.version;
        const remoteTotalMangas = indexData.metadata?.totalMangas;
        
        // Obter timestamps locais
        const localLastUpdated = parseInt(await getMetadata('catalogLastUpdated') || '0');
        const localVersion = await getMangaCacheVersion();
        
        debugLog('Comparando timestamps', { 
            remoteLastUpdated, 
            localLastUpdated,
            remoteVersion,
            localVersion
        });
        
        // Comparar lastUpdated - mais preciso que version
        if (remoteLastUpdated && remoteLastUpdated > localLastUpdated) {
            debugLog('Novidades detectadas via lastUpdated', { 
                remote: remoteLastUpdated, 
                local: localLastUpdated,
                diff: remoteLastUpdated - localLastUpdated
            });
            
            if (showIndicator) {
                const currentCount = store.getState().allManga.length;
                const newWorksCount = remoteTotalMangas ? remoteTotalMangas - currentCount : 0;
                showUpdateAvailableIndicator(newWorksCount, remoteLastUpdated);
            }
            
            return { hasUpdates: true, remoteLastUpdated, remoteTotalMangas };
        } 
        // Fallback: comparar versão
        else if (remoteVersion && remoteVersion !== localVersion) {
            debugLog('Nova versão detectada', { remote: remoteVersion, local: localVersion });
            
            if (showIndicator) {
                const currentCount = store.getState().allManga.length;
                const newWorksCount = remoteTotalMangas ? remoteTotalMangas - currentCount : 0;
                showUpdateAvailableIndicator(newWorksCount);
            }
            
            return { hasUpdates: true, remoteVersion };
        }
        
        debugLog('Catálogo atualizado', { version: localVersion, lastUpdated: localLastUpdated });
        return { hasUpdates: false };
        
    } catch (error) {
        debugLog('Erro ao verificar atualizações', { error: error.message });
        return { hasUpdates: false, error: error.message };
    }
}

// Iniciar verificação periódica
function startPeriodicUpdateCheck() {
    // Limpar intervalo anterior se existir
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
    }
    
    debugLog('Iniciando verificação periódica', { intervalMs: UPDATE_CHECK_INTERVAL_MS });
    
    updateCheckInterval = setInterval(async () => {
        const { settings } = store.getState();
        if (!settings.notificationsEnabled) return;
        
        // Só verificar se a aba está visível
        if (document.visibilityState !== 'visible') return;
        
        debugLog('Verificação periódica executando...');
        const result = await checkForUpdatesInBackground(true);
        
        if (result.hasUpdates) {
            // Atualizar badge do favicon
            updateFaviconBadge(store.getState().unreadUpdates + 1);
        }
    }, UPDATE_CHECK_INTERVAL_MS);
}

// Parar verificação periódica
function stopPeriodicUpdateCheck() {
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = null;
        debugLog('Verificação periódica parada');
    }
}

// Mostrar indicador visual de atualização disponível
function showUpdateAvailableIndicator(newWorksCount = 0, remoteLastUpdated = null) {
    // Evitar duplicatas
    if (document.getElementById('update-indicator')) return;
    
    const hasNewWorks = newWorksCount > 0;
    
    const indicator = document.createElement('button');
    indicator.id = 'update-indicator';
    indicator.className = 'fixed bottom-20 right-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2 animate-pulse';
    
    // Texto dinâmico baseado em novas obras
    const buttonText = hasNewWorks 
        ? `+${newWorksCount} novas obras` 
        : 'Novidades disponíveis';
    
    indicator.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        <span>${buttonText}</span>
    `;
    indicator.onclick = async () => {
        indicator.remove();
        // Salvar o lastUpdated antes de recarregar
        if (remoteLastUpdated) {
            await setMetadata('catalogLastUpdated', remoteLastUpdated.toString());
        }
        window.location.reload();
    };
    
    document.body.appendChild(indicator);
    
    // Atualizar badge do favicon
    updateFaviconBadge(newWorksCount || 1);
    
    // Remover animação após 3 segundos mas manter botão
    setTimeout(() => indicator.classList.remove('animate-pulse'), 3000);
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Export para compatibilidade com modules (se necessário)
export { initializeApp, debugLog };
