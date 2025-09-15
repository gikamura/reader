import { saveFavoritesToCache, loadFavoritesFromCache } from './cache.js';
import { getInitialState } from './constants.js';

let state = getInitialState();

// A lista de 'listeners' que serão chamados quando o estado mudar.
const subscribers = new Set();

/**
 * O objeto 'store' é a única fonte de verdade para o estado da aplicação.
 * Ele contém o estado e os métodos (ações) para modificá-lo.
 * Após cada modificação, ele notifica todos os 'subscribers'.
 */
export const store = {
    // Ação para se inscrever nas mudanças de estado.
    subscribe(callback) {
        subscribers.add(callback);
    },

    // Ação para obter uma cópia segura do estado atual.
    getState() {
        return { ...state };
    },
    
    // --- Ações que modificam o estado ---

    setAllManga(mangaArray) {
        state.allManga = mangaArray;
        notify();
    },

    setFavorites(favoritesSet) {
        state.favorites = favoritesSet;
        notify();
    },

    toggleFavorite(mangaUrl) {
        if (state.favorites.has(mangaUrl)) {
            state.favorites.delete(mangaUrl);
        } else {
            state.favorites.add(mangaUrl);
        }
        saveFavoritesToCache(state.favorites);
        notify();
    },

    setCurrentPage(page) {
        state.currentPage = page;
        notify();
    },

    setSearchQuery(query) {
        state.searchQuery = query;
        notify();
    },

    setActiveTab(tab) {
        state.activeTab = tab;
        notify();
    },

    setActiveTypeFilter(type) {
        state.activeTypeFilter = type;
        notify();
    },
    
    setLibrarySortOrder(order) {
        state.librarySortOrder = order;
        notify();
    },

    setLoading(isLoading) {
        state.isLoading = isLoading;
        notify();
    },

    setError(errorMessage) {
        state.error = errorMessage;
        notify();
    }
};

/**
 * Notifica todos os subscribers que o estado foi alterado.
 */
function notify() {
    subscribers.forEach(callback => callback());
}

/**
 * Inicializa o store com dados do cache.
 */
export function initializeStore() {
    const favorites = loadFavoritesFromCache();
    store.setFavorites(favorites);
}
