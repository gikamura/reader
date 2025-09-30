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

    // NOVAS FUNÇÕES PARA O ESTADO DE SCANS
    setScansList: (scansArray) => {
        state.scansList = scansArray;
        state.isLoadingScans = false;
        notify();
    },
    
    setSelectedScan: (scanData) => {
        state.selectedScan = scanData;
        state.isLoadingScans = false;
        notify();
    },

    clearSelectedScan: () => {
        state.selectedScan = null;
        notify();
    },

    setLoadingScans: (isLoading) => {
        state.isLoadingScans = isLoading;
        notify();
    },

    setScanWorks: (works) => {
        state.scanWorks = works;
        notify();
    },

    setScanWorksCurrentPage: (page) => {
        state.scanWorksCurrentPage = page;
        notify();
    },
};

export async function fetchAndDisplayScanWorks(scanUrl) {
    store.setLoadingScans(true);
    store.setScanWorks([]);
    store.setScanWorksCurrentPage(1);

    try {
        // Etapa 1: Buscar os dados da scan (Nível 2)
        const { fetchWithTimeout, processMangaUrl, getWorkType } = window.SharedUtils;
        const response = await fetchWithTimeout(scanUrl);
        if (!response.ok) throw new Error(`Falha ao buscar dados da scan: ${response.statusText}`);
        
        const scan = await response.json();
        store.setSelectedScan(scan); // Guarda a informação básica da scan

        // Etapa 2: Buscar os detalhes de todas as obras (Nível 3)
        const works = Object.entries(scan.works);
        const BATCH_SIZE = 5;
        const BATCH_DELAY = 500;
        let allDetailedWorks = [];

        for (let i = 0; i < works.length; i += BATCH_SIZE) {
            const batch = works.slice(i, i + BATCH_SIZE);
            const fetchPromises = batch.map(async ([key, work]) => {
                const cubariUrl = work.chapters[0]?.url;
                if (!cubariUrl) return null;

                const preFetchedData = {
                    title: work.title,
                    cover_url: work.chapters[0]?.cover_url || null,
                    type: getWorkType(key, {})
                };

                const detailedWork = await processMangaUrl(cubariUrl, preFetchedData);
                if (!detailedWork || detailedWork.error) return null;
                
                detailedWork.type = getWorkType(key, detailedWork);
                return detailedWork;
            });

            const detailedWorksBatch = (await Promise.all(fetchPromises)).filter(Boolean);
            allDetailedWorks = [...allDetailedWorks, ...detailedWorksBatch];
            
            store.setScanWorks(allDetailedWorks);

            if (i + BATCH_SIZE < works.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }
    } catch (error) {
        console.error("Erro geral ao buscar obras da scan:", error);
        store.setError("Falha ao carregar as obras desta scan.");
    } finally {
        store.setLoadingScans(false);
    }
}

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
