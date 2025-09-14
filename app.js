import { initializeStore, store } from './store.js';
import { fetchAndProcessMangaData } from './api.js';
import { renderApp, getDOM, showNotification } from './ui.js';

function setupEventListeners() {
    const dom = getDOM();

    dom.tabs.addEventListener('click', (e) => {
        if (e.target.matches('.tab')) {
            store.setActiveTab(e.target.dataset.tab);
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

    document.body.addEventListener('click', (e) => {
        const favoriteBtn = e.target.closest('.favorite-btn');
        if (favoriteBtn) {
            store.toggleFavorite(favoriteBtn.dataset.url);
        }
        // --- ADICIONADO ---
        if (e.target.matches('#reload-page-btn')) {
            window.location.reload();
        }
    });
}

async function initializeApp() {
    const dom = getDOM();
    initializeStore();
    store.subscribe(renderApp);
    setupEventListeners();
    renderApp(); 

    try {
        // --- MODIFICADO ---
        const { data: mangaData, updated } = await fetchAndProcessMangaData((message) => {
            dom.subtitle.textContent = message;
        });
        
        store.setAllManga(mangaData);
        dom.subtitle.textContent = `${mangaData.length} obras no catálogo.`;

        // --- ADICIONADO ---
        if (updated) {
            showNotification("Catálogo atualizado com sucesso!");
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
