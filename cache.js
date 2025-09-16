import { CACHE_KEY, FAVORITES_KEY, CACHE_DURATION_MS, CACHE_VERSION_KEY } from './constants.js';

export const getMangaCache = () => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    try {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_DURATION_MS) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        return data;
    } catch (e) {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
};

export const setMangaCache = (data) => {
    try {
        const cachePayload = { timestamp: Date.now(), data };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
    } catch (e) {
        console.error("Erro ao salvar o cache de mangás:", e);
    }
};

export const loadFavoritesFromCache = () => {
    const favs = localStorage.getItem(FAVORITES_KEY);
    try {
        return new Set(favs ? JSON.parse(favs) : []);
    } catch (e) {
        localStorage.removeItem(FAVORITES_KEY);
        return new Set();
    }
};

export const saveFavoritesToCache = (favoritesSet) => {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favoritesSet)));
    } catch (e) {
        console.error("Erro ao salvar favoritos:", e);
    }
};

export const getMangaCacheVersion = () => {
    return localStorage.getItem(CACHE_VERSION_KEY);
};

export const setMangaCacheVersion = (version) => {
    localStorage.setItem(CACHE_VERSION_KEY, version);
};

export const clearMangaCache = () => {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_VERSION_KEY);
};

// --- FUNÇÕES PARA CONFIGURAÇÕES DE NOTIFICAÇÃO ---
const SETTINGS_KEY = 'gikamuraSettings';

export const loadSettingsFromCache = () => {
    const settings = localStorage.getItem(SETTINGS_KEY);
    try {
        const defaults = { notificationsEnabled: true, popupsEnabled: true };
        return settings ? { ...defaults, ...JSON.parse(settings) } : defaults;
    } catch (e) {
        return { notificationsEnabled: true, popupsEnabled: true };
    }
};

export const saveSettingsToCache = (settingsObject) => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsObject));
    } catch (e) {
        console.error("Erro ao salvar configurações:", e);
    }
};

// --- FUNÇÕES PARA HISTÓRICO DE ATUALIZAÇÕES ---
const UPDATES_KEY = 'gikamuraUpdates';

export const loadUpdatesFromCache = () => {
    const updates = localStorage.getItem(UPDATES_KEY);
    try {
        return updates ? JSON.parse(updates) : [];
    } catch (e) {
        return [];
    }
};

export const saveUpdatesToCache = (updatesArray) => {
    try {
        localStorage.setItem(UPDATES_KEY, JSON.stringify(updatesArray.slice(0, 30)));
    } catch (e) {
        console.error("Erro ao salvar atualizações:", e);
    }
};
