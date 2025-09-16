import { initializeStore, store } from './store.js';
import { fetchAndProcessMangaData } from './api.js';
import { renderApp, getDOM, showNotification, showUpdatePopup, showGroupedUpdatePopup } from './ui.js';

function setupEventListeners() {
    const dom = getDOM();

    dom.tabs.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab');
        if (tabButton) {
            const tabName = tabButton.dataset.tab;
            store.setActiveTab(tabName);
            // ATUALIZADO: Marca as atualizações como lidas ao visitar a aba
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

        // NOVO: Trata o clique na notificação agrupada para mudar de aba
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

function findNewChapterUpdates(oldManga, newManga) {
    const oldMangaMap = new Map(oldManga.map(m => [m.url, m]));
    const newUpdates = [];
    
    const lastCheckTimestamp = parseInt(localStorage.getItem('lastCheckTimestamp') || '0');

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

// ATUALIZADO: Lógica principal de notificação
async function checkForUpdates() {
    const { settings, allManga: oldMangaData, favorites } = store.getState();
    if (!settings.notificationsEnabled || oldMangaData.length === 0) {
        console.log("Notificações desabilitadas ou dados iniciais não carregados.");
        return;
    }

    console.log("Verificando por atualizações de capítulos...");
    try {
        const { data: newMangaData } = await fetchAndProcessMangaData(() => {});
        
        const newUpdates = findNewChapterUpdates(oldMangaData, newMangaData);
        
        if (newUpdates.length > 0) {
            console.log(`${newUpdates.length} obra(s) com novos capítulos.`, newUpdates);
            store.addUpdates(newUpdates);
            
            // Separa as atualizações entre favoritos e não-favoritos
            const favoriteUpdates = [];
            const otherUpdates = [];

            newUpdates.forEach(update => {
                if (favorites.has(update.manga.url)) {
                    favoriteUpdates.push(update);
                } else {
                    otherUpdates.push(update);
                }
            });

            // Mostra notificações individuais para favoritos
            favoriteUpdates.forEach(update => showUpdatePopup(update));

            // Mostra uma notificação agrupada para os outros, se houver
            if (otherUpdates.length > 0) {
                showGroupedUpdatePopup(otherUpdates.length);
            }

            store.setAllManga(newMangaData);
        } else {
            console.log("Nenhum novo capítulo encontrado.");
        }

        localStorage.setItem('lastCheckTimestamp', Date.now().toString());

    } catch (error) {
        console.error("Erro ao verificar atualizações de capítulos:", error);
    }
}

async function initializeApp() {
    const dom = getDOM();
    initializeStore();
    store.subscribe(renderApp);
    setupEventListeners();
    renderApp(); 

    try {
        const { data: mangaData, updated } = await fetchAndProcessMangaData((message) => {
            dom.subtitle.textContent = message;
        });
        
        store.setAllManga(mangaData);
        dom.subtitle.textContent = `${mangaData.length} obras no catálogo.`;

        if (updated) {
            localStorage.setItem('lastCheckTimestamp', Date.now().toString());
            showNotification("O catálogo foi atualizado com sucesso!");
        }

    } catch (error) {
        console.error("Erro fatal na inicialização:", error);
        const errorMsg = `Erro ao carregar o catálogo. Verifique sua conexão. (${error.message})`;
        store.setError(errorMsg);
    } finally {
        store.setLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
