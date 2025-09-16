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

    // Listener para o seletor de ordenação
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            store.setLibrarySortOrder(e.target.value);
        });
    }

    // Delegação de eventos para filtros e favoritos
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

    // --- NOVO CÓDIGO ---
    // Verifica por atualizações quando o usuário volta para a aba do navegador
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForUpdates();
        }
    });
}

/**
 * Verifica se há uma nova versão do catálogo e, se houver, atualiza os dados.
 */
async function checkForUpdates() {
    console.log("Verificando por atualizações...");
    try {
        // Usamos { cache: 'no-store' } para garantir que estamos sempre pegando a versão mais recente do index
        const response = await fetch('https://raw.githubusercontent.com/admingikamura/data/refs/heads/main/hub/index.json', { cache: 'no-store' });
        if (!response.ok) return;

        const indexData = await response.json();
        const remoteVersion = indexData.metadata.version;
        const localVersion = localStorage.getItem('mangaCatalogVersion');

        if (remoteVersion && remoteVersion !== localVersion) {
            console.log(`Nova versão encontrada: ${remoteVersion}. Atualizando...`);
            showNotification("Um novo catálogo está sendo carregado...", 5000);

            // Reutiliza a lógica principal de busca e processamento
            const { data: mangaData } = await fetchAndProcessMangaData(() => {});

            store.setAllManga(mangaData); // Atualiza o estado
            showNotification("O catálogo foi atualizado com sucesso!");
        } else {
            console.log("Nenhuma atualização encontrada.");
        }
    } catch (error) {
        console.error("Erro ao verificar atualizações:", error);
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

document.addEventListener('DOMContentLoaded', initializeApp);
