import './cache-coordinator.js';

const DB_NAME = 'gikamuraDB';
const DB_VERSION = 3; // Incrementado para forçar atualização do cache de scans com status corrigido
const SCAN_WORKS_CACHE_VERSION = 2; // Versão do cache de obras de scans (incrementar para invalidar cache)

const MANGA_STORE = 'mangaCatalog';
const FAVORITES_STORE = 'favorites';
const UPDATES_STORE = 'updates';
const SETTINGS_STORE = 'settings';
const METADATA_STORE = 'metadata';
const SCANS_LIST_STORE = 'scansList';
const SCAN_WORKS_STORE = 'scanWorks';

let db;
let cacheCoordinator;

const initDB = () => {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Erro ao abrir o IndexedDB:", event);
            reject("Erro ao abrir o banco de dados.");
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains(MANGA_STORE)) {
                dbInstance.createObjectStore(MANGA_STORE, { keyPath: 'url' });
            }
            if (!dbInstance.objectStoreNames.contains(FAVORITES_STORE)) {
                dbInstance.createObjectStore(FAVORITES_STORE, { keyPath: 'url' });
            }
            if (!dbInstance.objectStoreNames.contains(UPDATES_STORE)) {
                const updatesStore = dbInstance.createObjectStore(UPDATES_STORE, { autoIncrement: true });
                updatesStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            if (!dbInstance.objectStoreNames.contains(SETTINGS_STORE)) {
                dbInstance.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
            }
            if (!dbInstance.objectStoreNames.contains(METADATA_STORE)) {
                dbInstance.createObjectStore(METADATA_STORE, { keyPath: 'key' });
            }
            // Novas stores para Scans
            if (!dbInstance.objectStoreNames.contains(SCANS_LIST_STORE)) {
                dbInstance.createObjectStore(SCANS_LIST_STORE, { keyPath: 'url' });
            }
            if (!dbInstance.objectStoreNames.contains(SCAN_WORKS_STORE)) {
                const scanWorksStore = dbInstance.createObjectStore(SCAN_WORKS_STORE, { keyPath: 'scanUrl' });
                scanWorksStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
};

const getStore = (storeName, mode) => {
    return db.transaction(storeName, mode).objectStore(storeName);
};

const clearStore = (storeName) => {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(`Erro ao limpar a store ${storeName}: ${event.target.error}`);
    });
};

export const getMangaCache = async () => {
    await initDB();
    return new Promise((resolve, reject) => {
        const store = getStore(MANGA_STORE, 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.length > 0 ? request.result : null);
        request.onerror = (event) => {
            console.error("Erro ao buscar cache de mangás:", event.target.error);
            reject(null);
        };
    });
};

export const setMangaCache = async (data) => {
    await initDB();
    const transaction = db.transaction(MANGA_STORE, 'readwrite');
    const store = transaction.objectStore(MANGA_STORE);
    store.clear();
    data.forEach(item => store.put(item));
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
};

const getMetadata = async (key) => {
    await initDB();
    return new Promise((resolve) => {
        const store = getStore(METADATA_STORE, 'readonly');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => resolve(null);
    });
};

const setMetadata = async (key, value) => {
    await initDB();
    return new Promise((resolve, reject) => {
        const store = getStore(METADATA_STORE, 'readwrite');
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(`Erro ao salvar metadado ${key}: ${event.target.error}`);
    });
};

// ==========================================================
// FUNÇÃO ADICIONADA DE VOLTA
// ==========================================================
export const clearMangaCache = async () => {
    await initDB();
    await clearStore(MANGA_STORE);
    await setMetadata('cacheVersion', null); // Também limpa a versão
};
// ==========================================================

export const loadFavoritesFromCache = async () => {
    await initDB();
    return new Promise((resolve, reject) => {
        const store = getStore(FAVORITES_STORE, 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
            const favUrls = request.result.map(item => item.url);
            resolve(new Set(favUrls));
        };
        request.onerror = () => resolve(new Set());
    });
};

export const saveFavoritesToCache = async (favoritesSet) => {
    await initDB();
    const transaction = db.transaction(FAVORITES_STORE, 'readwrite');
    const store = transaction.objectStore(FAVORITES_STORE);
    store.clear();
    Array.from(favoritesSet).forEach(url => store.put({ url }));
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
};

export const getMangaCacheVersion = () => getMetadata('cacheVersion');
export const setMangaCacheVersion = (version) => setMetadata('cacheVersion', version);
export const getLastCheckTimestamp = () => getMetadata('lastCheckTimestamp');
export const setLastCheckTimestamp = (timestamp) => setMetadata('lastCheckTimestamp', timestamp);

export const loadSettingsFromCache = async () => {
    await initDB();
    return new Promise((resolve) => {
        const store = getStore(SETTINGS_STORE, 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
            const defaults = { notificationsEnabled: true, popupsEnabled: true };
            const settingsFromDB = request.result.reduce((acc, setting) => {
                acc[setting.key] = setting.value;
                return acc;
            }, {});
            resolve({ ...defaults, ...settingsFromDB });
        };
        request.onerror = () => resolve({ notificationsEnabled: true, popupsEnabled: true });
    });
};

export const saveSettingsToCache = async (settingsObject) => {
    await initDB();
    const transaction = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    for (const key in settingsObject) {
        store.put({ key: key, value: settingsObject[key] });
    }
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
};

export const loadUpdatesFromCache = async () => {
    await initDB();
    return new Promise((resolve) => {
        const updates = [];
        const store = getStore(UPDATES_STORE, 'readonly');
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev'); 
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                updates.push(cursor.value);
                cursor.continue();
            } else {
                resolve(updates);
            }
        };
        request.onerror = (event) => {
            console.error("Erro ao carregar atualizações via cursor:", event.target.error);
            resolve([]);
        };
    });
};

export const saveUpdatesToCache = async (updatesArray) => {
    await initDB();
    const transaction = db.transaction(UPDATES_STORE, 'readwrite');
    const store = transaction.objectStore(UPDATES_STORE);
    store.clear();
    updatesArray.slice(0, 50).forEach(update => {
        store.add(update);
    });
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
};

// ============================================
// NOVAS FUNÇÕES PARA CACHE DE SCANS
// ============================================

/**
 * Salva a lista de scans no IndexedDB
 */
export const saveScansListToCache = async (scansList) => {
    try {
        await initDB();
        const transaction = db.transaction(SCANS_LIST_STORE, "readwrite");
        const store = transaction.objectStore(SCANS_LIST_STORE);
        store.clear();
        scansList.forEach(scan => {
            if (scan && scan.url) {
                store.add({ ...scan, timestamp: Date.now() });
            }
        });
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    } catch (error) {
        console.error("Erro ao salvar scans no cache:", error);
    }
};

export const loadScansListFromCache = async () => {
    try {
        await initDB();
        const transaction = db.transaction(SCANS_LIST_STORE, "readonly");
        const store = transaction.objectStore(SCANS_LIST_STORE);
        const request = store.getAll();
        return new Promise((resolve) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    } catch (error) {
        return [];
    }
};

export const saveScanWorksToCache = async (scanUrl, works) => {
    try {
        await initDB();
        const transaction = db.transaction(SCAN_WORKS_STORE, "readwrite");
        const store = transaction.objectStore(SCAN_WORKS_STORE);
        store.put({ scanUrl, works, timestamp: Date.now(), version: SCAN_WORKS_CACHE_VERSION });
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    } catch (error) {
        console.error("Erro ao salvar obras da scan no cache:", error);
    }
};

export const loadScanWorksFromCache = async (scanUrl) => {
    try {
        await initDB();
        const transaction = db.transaction(SCAN_WORKS_STORE, "readonly");
        const store = transaction.objectStore(SCAN_WORKS_STORE);
        const request = store.get(scanUrl);
        return new Promise((resolve) => {
            request.onsuccess = () => {
                const cached = request.result;
                // Validar versão do cache - invalidar se for versão antiga
                if (cached && cached.version === SCAN_WORKS_CACHE_VERSION && cached.works) {
                    resolve(cached.works);
                } else {
                    console.log(`🔄 Cache de scan inválido ou desatualizado (v${cached?.version || 0} vs v${SCAN_WORKS_CACHE_VERSION}), ignorando`);
                    resolve([]);
                }
            };
            request.onerror = () => resolve([]);
        });
    } catch (error) {
        return [];
    }
};
