import { initializeStore, store } from './store.js';
import { fetchAndProcessMangaData } from './api.js';
import { renderApp, getDOM, showNotification, showUpdatePopup, showGroupedUpdatePopup } from './ui.js';
import { getLastCheckTimestamp, setLastCheckTimestamp } from './cache.js';

function setupEventListeners() {
    const dom = getDOM();

    dom.tabs.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab');
        if (tabButton) {
            const tabName = tabButton.dataset.tab;
            store.setActiveTab(tabName);
            if (tabName === 'updates') {
                store.markUpdatesAsRead();
            }
        }
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
            store.setCurrentPage(parseInt(e.target.dataset.page));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            store.setLibrarySortOrder(e.target.value);
        });
    }

    document.body.addEventListener('click', (e) => {
        const typeButton = e.target.closest('#type-filter-container .filter-btn');
        if (typeButton) {
            store.setActiveTypeFilter(typeButton.dataset.type);
            store.setCurrentPage(1);
        }

        const statusButton = e.target.closest('#status-filter-container .filter-btn');
        if (statusButton) {
            store.setActiveStatusFilter(statusButton.dataset.status);
            store.setCurrentPage(1);
        }
        
        const favoriteBtn = e.target.closest('.favorite-btn');
        if (favoriteBtn) {
            store.toggleFavorite(favoriteBtn.dataset.url);
            favoriteBtn.classList.add('pulsing');
            favoriteBtn.addEventListener('animationend', () => {
                favoriteBtn.classList.remove('pulsing');
            }, { once: true });
        }

        if (e.target.matches('#reload-page-btn')) {
            window.location.reload();
        }

        const groupedNotification = e.target.closest('.notification-grouped');
        if (groupedNotification && groupedNotification.dataset.tabTarget) {
            e.preventDefault();
            const tabName = groupedNotification.dataset.tabTarget;
            store.setActiveTab(tabName);
            store.markUpdatesAsRead();
        }
    });

    const backToTopButton = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopButton.classList.remove('hidden');
        } else {
            backToTopButton.classList.add('hidden');
        }
    });
    backToTopButton.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    dom.notificationsEnabledToggle.addEventListener('change', (e) => {
        store.setSettings({ notificationsEnabled: e.target.checked });
    });

    dom.popupsEnabledToggle.addEventListener('change', (e) => {
        store.setSettings({ popupsEnabled: e.target.checked });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForUpdates();
        }
    });
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
                    newChaptersInManga.push({
                        title: newChapter.title || `Capítulo ${chapterKey}`,
                        timestamp: chapterTimestamp,
                    });
                }
            }
        }

        if (newChaptersInManga.length > 0) {
            newUpdates.push({
                manga: manga,
                newChapters: newChaptersInManga.sort((a,b) => b.timestamp - a.timestamp),
                timestamp: Date.now()
            });
        }
    });
    
    return newUpdates.sort((a, b) => b.timestamp - a.timestamp);
}

async function checkForUpdates() {
    const { settings, allManga: oldMangaData, favorites } = store.getState();
    if (!settings.notificationsEnabled || oldMangaData.length === 0) {
        return;
    }

    try {
        const { data: newMangaData } = await fetchAndProcessMangaData(() => {});
        const newUpdates = await findNewChapterUpdates(oldMangaData, newMangaData);
        
        if (newUpdates.length > 0) {
            store.addUpdates(newUpdates);
            const favoriteUpdates = [];
            const otherUpdates = [];
            newUpdates.forEach(update => {
                if (favorites.has(update.manga.url)) {
                    favoriteUpdates.push(update);
                } else {
                    otherUpdates.push(update);
                }
            });
            favoriteUpdates.forEach(update => showUpdatePopup(update));
            if (otherUpdates.length > 0) {
                showGroupedUpdatePopup(otherUpdates.length);
            }
            store.setAllManga(newMangaData);
        }
        await setLastCheckTimestamp(Date.now().toString());
    } catch (error) {
        console.error("Erro ao verificar atualizações de capítulos:", error);
    }
}

async function initializeApp() {
    const dom = getDOM();
    await initializeStore();
    store.subscribe(renderApp);
    setupEventListeners();
    renderApp(); 

    // Função que será executada a cada lote processado
    const onBatchProcessed = (batch) => {
        // Remove o loader principal e exibe o conteúdo na chegada do primeiro lote
        if (store.getState().isLoading) {
            store.setLoading(false); 
        }
        store.addMangaToCatalog(batch);
        
        const currentCount = store.getState().allManga.length;
        dom.subtitle.textContent = `${currentCount} obras carregadas...`;
    };

    try {
        const { data: finalMangaData, updated } = await fetchAndProcessMangaData(
            (message) => dom.subtitle.textContent = message,
            onBatchProcessed // Passando a nova função como callback
        );
        
        // Se o catálogo veio do cache, a função acima retorna os dados de uma vez
        if (finalMangaData && store.getState().allManga.length === 0) {
            store.setAllManga(finalMangaData);
        }

        dom.subtitle.textContent = `${store.getState().allManga.length} obras no catálogo.`;

        if (updated) {
            await setLastCheckTimestamp(Date.now().toString());
            showNotification("O catálogo foi atualizado com sucesso!");
        }

    } catch (error) {
        console.error("Erro fatal na inicialização:", error);
        const errorMsg = `Erro ao carregar o catálogo. Verifique sua conexão. (${error.message})`;
        store.setError(errorMsg);
    } finally {
        if(store.getState().isLoading) {
            store.setLoading(false);
        }
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
