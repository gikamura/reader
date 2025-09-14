export const ITEMS_PER_PAGE = 21;
export const CACHE_KEY = 'mangaCatalogCache';
export const CACHE_VERSION_KEY = 'mangaCatalogVersion'; // --- ADICIONADO ---
export const FAVORITES_KEY = 'mangaFavorites';
export const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas (aumentado, pois a versão controla o refresh)
export const INDEX_URL = 'https://raw.githubusercontent.com/Jhoorodre/data_gk/refs/heads/main/hub/index.json';
export const PROXIES = [
    'https://api.allorigins.win/raw?url=', 
    'https://thingproxy.freeboard.io/fetch/', 
    'https://corsproxy.io/?'
];

export function getInitialState() {
    return {
        allManga: [],
        favorites: new Set(),
        currentPage: 1,
        searchQuery: '',
        activeTab: 'home',
        isLoading: true,
        error: null,
    };
}
