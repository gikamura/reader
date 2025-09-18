import { saveFavoritesToCache, loadFavoritesFromCache, saveSettingsToCache, loadSettingsFromCache, saveUpdatesToCache, loadUpdatesFromCache } from './cache.js';
import { getInitialState } from './constants.js';

let state = getInitialState();

const subscribers = new Set();

const notify = () => subscribers.forEach(callback => callback());

export const store = {
    subscribe(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
    },

    getState() {
        return { ...state };
    },
    
    setAllManga(mangaArray) {
        state.allManga = mangaArray;
        notify();
    },

    addMangaToCatalog(mangaArray) {
        const validManga = mangaArray.filter(m => m && !m.error);
        if (validManga.length > 0) {
            const existingUrls = new Set(state.allManga.map(m => m.url));
            const newManga = validManga.filter(m => !existingUrls.has(m.url));
            state.allManga = [...state.allManga, ...newManga];
            notify();
        }
    },

    setFavorites(favoritesSet) {
        state.favorites = favoritesSet;
        notify();
    },

    toggleFavorite(mangaUrl) {
        state.favorites.has(mangaUrl) ? state.favorites.delete(mangaUrl) : state.favorites.add(mangaUrl);
        saveFavoritesToCache(state.favorites);
        notify();
    },

    setUpdates(updatesArray) {
        state.updates = updatesArray.slice(0, 50);
        state.unreadUpdates = updatesArray.filter(u => u.read === false).length;
        notify();
    },

    addUpdates(newUpdates) {
        if (newUpdates.length === 0) return;
        const updatesWithReadState = newUpdates.map(u => ({ ...u, read: false }));
        const updatedList = [...updatesWithReadState, ...state.updates];
        state.updates = updatedList.slice(0, 50);
        state.unreadUpdates += newUpdates.length;
        saveUpdatesToCache(state.updates);
        notify();
    },
    
    markAllUpdatesAsRead() {
        if (state.unreadUpdates > 0) {
            state.unreadUpdates = 0;
            state.updates = state.updates.map(u => ({ ...u, read: true }));
            saveUpdatesToCache(state.updates);
            notify();
        }
    },

    setSettings(newSettings) {
        state.settings = { ...state.settings, ...newSettings };
        saveSettingsToCache(state.settings);
        notify();
    },

    setCurrentPage: (page) => { state.currentPage = page; notify(); },
    setSearchQuery: (query) => { state.searchQuery = query; notify(); },
    setActiveTab: (tab) => { state.activeTab = tab; notify(); },
    setActiveTypeFilter: (type) => { state.activeTypeFilter = type; notify(); },
    setActiveStatusFilter: (status) => { state.activeStatusFilter = status; notify(); },
    setLibrarySortOrder: (order) => { state.librarySortOrder = order; notify(); },
    setLoading: (isLoading) => { state.isLoading = isLoading; notify(); },
    setError: (errorMessage) => { state.error = errorMessage; notify(); },
};

export async function initializeStore() {
    const [favorites, settings, updates] = await Promise.all([
        loadFavoritesFromCache(),
        loadSettingsFromCache(),
        loadUpdatesFromCache()
    ]);
    
    store.setFavorites(favorites);
    store.setSettings(settings);
    store.setUpdates(updates);
}
