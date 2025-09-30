export const ITEMS_PER_PAGE = 21;
export const CACHE_KEY = 'mangaCatalogCache';
export const CACHE_VERSION_KEY = 'mangaCatalogVersion';
export const FAVORITES_KEY = 'mangaFavorites';
export const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 horas
export const INDEX_URL = 'https://raw.githubusercontent.com/gikawork/data/refs/heads/main/hub/index.json';

// NOVO: URL do índice que lista todas as scans
export const SCANS_INDEX_URL = 'https://raw.githubusercontent.com/gikawork/scan/refs/heads/main/index.json';

/**
 * Retorna o estado inicial da aplicação.
 * Usado para inicializar o store e para resetar o estado se necessário.
 */
export function getInitialState() {
    return {
        allManga: [],
        favorites: new Set(),
        updates: [],
        settings: {
            notificationsEnabled: true,
            popupsEnabled: true,
        },
        unreadUpdates: 0, // NOVO: Contador para notificações não lidas
        currentPage: 1,
        searchQuery: '',
        activeTab: 'home',
        activeTypeFilter: 'all',
        activeStatusFilter: 'all',
        librarySortOrder: 'title', // Ordenação da biblioteca
        isLoading: true,
        error: null,
        // NOVOS ESTADOS PARA SCANS
        scansList: [],
        selectedScan: null, // Armazenará os dados da scan selecionada (info e lista de obras)
        isLoadingScans: true,
        scanWorks: [], // Armazenará os detalhes completos das obras da scan selecionada
        scanWorksCurrentPage: 1, // Paginação para as obras da scan
    };
}

