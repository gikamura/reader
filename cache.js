import { CACHE_KEY, FAVORITES_KEY, CACHE_DURATION_MS, CACHE_VERSION_KEY } from './constants.js';

export const getMangaCache = () => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    try {
        // A verificação de tempo não é mais estritamente necessária aqui,
        // pois a versão controla a atualização, mas mantemos como um fallback.
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

// --- NOVAS FUNÇÕES ---
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
