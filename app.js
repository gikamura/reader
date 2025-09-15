import { initializeStore, store } from './store.js';
import { fetchAndProcessMangaData } from './api.js';
import { renderApp, getDOM, showNotification } from './ui.js';

/**
 * Anexa os event listeners da aplicação.
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

    // Listener para os filtros de tipo
    if (dom.typeFilterContainer) {
        dom.typeFilterContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.type-filter-btn');
            if (button) {
                const type = button.dataset.type;
                store.setActiveTypeFilter(type);
                store.setCurrentPage(1); // Reseta para a primeira página ao aplicar filtro
            }
        });
    }

    // Listener para o seletor de ordenação
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            store.setLibrarySortOrder(e.target.value);
        });
    }

    // Listener delegado para favoritos e botão de recarregar
    document.body.addEventListener('click', (e) => {
        const favoriteBtn = e.target.closest('.favorite-btn');
        if (favoriteBtn) {
            store.toggleFavorite(favoriteBtn.dataset.url);
            // Adiciona classe para animação de "pulso"
            favoriteBtn.classList.add('pulsing');
            favoriteBtn.addEventListener('animationend', () => {
                favoriteBtn.classList.remove('pulsing');
            }, { once: true });
        }

        if (e.target.matches('#reload-page-btn')) {
            window.location.reload();
        }
    });

    // Listener para o botão "Voltar ao Topo"
    const backToTopButton = document.getElementById('back-to-top');
    if (backToTopButton) {
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
    }
}

/**
 * Função principal de inicialização da aplicação.
 */
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

// Inicia a aplicação quando o DOM estiver pronto.
document.addEventListener('DOMContentLoaded', initializeApp);
