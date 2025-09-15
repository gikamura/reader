export const ITEMS_PER_PAGE = 21;
export const CACHE_KEY = 'mangaCatalogCache';
export const CACHE_VERSION_KEY = 'mangaCatalogVersion';
export const FAVORITES_KEY = 'mangaFavorites';
export const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 horas
export const INDEX_URL = 'https://raw.githubusercontent.com/Jhoorodre/data_gk/refs/heads/main/hub/index.json';
export const PROXIES = [
    'https://api.allorigins.win/raw?url=', 
    'https://thingproxy.freeboard.io/fetch/', 
    'https://corsproxy.io/?'
];

/**
 * Retorna o estado inicial da aplicação.
 * Usado para inicializar o store e para resetar o estado se necessário.
 */
export function getInitialState() {
    return {
        allManga: [],
        favorites: new Set(),
        currentPage: 1,
        searchQuery: '',
        activeTab: 'home',
        activeTypeFilter: 'all', // Filtro por tipo
        librarySortOrder: 'title', // Ordenação da biblioteca
        isLoading: true,
        error: null,
    };
}
