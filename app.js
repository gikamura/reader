import { initializeStore, store } from './store.js';
import { fetchAndProcessMangaData } from './api.js';
import { renderApp, getDOM } from './ui.js';

/**
 * Anexa os event listeners da aplicação.
 * As funções de callback disparam ações no store, que por sua vez aciona a re-renderização.
 */
function setupEventListeners() {
    const dom = getDOM();

    dom.tabs.addEventListener('click', (e) => {
        if (e.target.matches('.tab')) {
            store.setActiveTab(e.target.dataset.tab);
        }
    });

    // Debounce para evitar re-renderizações excessivas ao digitar
    let searchTimeout;
    dom.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            store.setSearchQuery(e.target.value);
            store.setCurrentPage(1); // Resetar para a primeira página em nova busca
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
    });
}

/**
 * Função principal de inicialização da aplicação.
 */
async function initializeApp() {
    const dom = getDOM();

    // 1. Inicializa o store (carrega favoritos, etc.) e se inscreve nas mudanças.
    initializeStore();
    store.subscribe(renderApp);

    // 2. Anexa os event listeners
    setupEventListeners();

    // 3. Renderiza o estado inicial (abas, etc.)
    renderApp(); 

    try {
        // 4. Busca os dados (do cache ou da rede)
        const mangaData = await fetchAndProcessMangaData((message) => {
            dom.subtitle.textContent = message;
        });
        
        // 5. Atualiza o store com os dados, o que acionará uma nova renderização.
        store.setAllManga(mangaData);
        dom.subtitle.textContent = `${mangaData.length} obras no catálogo.`;

    } catch (error) {
        console.error("Erro fatal na inicialização:", error);
        const errorMsg = `Erro ao carregar o catálogo. Verifique o console para detalhes. (${error.message})`;
        store.setError(errorMsg);
    } finally {
        store.setLoading(false);
    }
}

// Inicia a aplicação quando o DOM estiver pronto.
document.addEventListener('DOMContentLoaded', initializeApp);
