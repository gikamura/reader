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

    setUpdates(updatesArray) {
        state.updates = updatesArray.slice(0, 30);
        // ATUALIZADO: Considera-se que as atualizações carregadas do cache já foram vistas.
        state.unreadUpdates = 0;
        saveUpdatesToCache(state.updates);
        notify();
    },

    addUpdates(newUpdates) {
        if (newUpdates.length === 0) return;
        const updatedList = [...newUpdates, ...state.updates];
        state.updates = updatedList.slice(0, 30);
        // ATUALIZADO: Incrementa o contador de não lidas com o número de novas atualizações.
        state.unreadUpdates += newUpdates.length;
        saveUpdatesToCache(state.updates);
        notify();
    },
    
    // NOVO: Função para marcar as atualizações como lidas.
    markUpdatesAsRead() {
        if (state.unreadUpdates > 0) {
            state.unreadUpdates = 0;
            // Opcional: Futuramente, você pode adicionar um status 'read: true' em cada item
            // e salvar no cache aqui. Por ora, apenas zerar o contador já resolve a UX do badge.
            notify();
        }
    },

    setSettings(newSettings) {
        state.settings = { ...state.settings, ...newSettings };
        saveSettingsToCache(state.settings);
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
    
    const settings = loadSettingsFromCache();
    store.setSettings(settings);

    const updates = loadUpdatesFromCache();
    store.setUpdates(updates);
}
