import { saveFavoritesToCache, loadFavoritesFromCache, saveSettingsToCache, loadSettingsFromCache, saveUpdatesToCache, loadUpdatesFromCache } from './cache.js';
import { getInitialState } from './constants.js';

let state = getInitialState();

const subscribers = new Set();

export const store = {
    subscribe(callback) {
        subscribers.add(callback);
    },

    getState() {
        return { ...state };
    },
    
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

    // --- NOVAS FUNÇÕES E ESTADOS ---
    setUpdates(updatesArray) {
        // Limita a 30 atualizações
        state.updates = updatesArray.slice(0, 30);
        saveUpdatesToCache(state.updates);
        notify();
    },

    addUpdates(newUpdates) {
        // Adiciona novas atualizações no início e mantém o limite de 30
        const updatedList = [...newUpdates, ...state.updates];
        state.updates = updatedList.slice(0, 30);
        saveUpdatesToCache(state.updates);
        notify();
    },

    setSettings(newSettings) {
        state.settings = { ...state.settings, ...newSettings };
        saveSettingsToCache(state.settings);
        notify();
    },
    // --------------------------------

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

function notify() {
    subscribers.forEach(callback => callback());
}

export function initializeStore() {
    const favorites = loadFavoritesFromCache();
    store.setFavorites(favorites);
    
    // --- INICIALIZAÇÃO DOS NOVOS DADOS ---
    const settings = loadSettingsFromCache();
    store.setSettings(settings);

    const updates = loadUpdatesFromCache();
    store.setUpdates(updates);
}
