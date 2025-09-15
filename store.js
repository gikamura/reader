import { saveFavoritesToCache, loadFavoritesFromCache } from './cache.js';
import { getInitialState } from './constants.js';

let state = getInitialState();

// A lista de 'listeners' que serão chamados quando o estado mudar.
const subscribers = new Set();

/**
 * O objeto 'store' é a única fonte de verdade para o estado da aplicação.
 */
export const store = {
    subscribe(callback) {
        subscribers.add(callback);
    },

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
    
    setActiveStatusFilter(status) {
        state.activeStatusFilter = status;
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

function notify() {
    subscribers.forEach(callback => callback());
}

export function initializeStore() {
    const favorites = loadFavoritesFromCache();
    store.setFavorites(favorites);
}
