/**
 * Coordenador de Cache Unificado
 * Gerencia cache entre contexto principal e Service Worker
 */

class CacheCoordinator {
    constructor() {
        this.isServiceWorker = typeof self !== 'undefined' && typeof importScripts === 'function';
        this.cacheName = 'gikamura-cache-v1';
        this.indexedDBName = 'GikamuraDB';
        this.indexedDBVersion = 1;

        // Configurações de cache
        this.config = {
            maxAge: 6 * 60 * 60 * 1000, // 6 horas
            maxSize: 5 * 1024 * 1024,   // 5MB limite localStorage
            compressionEnabled: true,
            autoCleanup: true
        };
    }

    /**
     * Inicializar sistema de cache
     */
    async initialize() {
        if (this.isServiceWorker) {
            return this.initServiceWorkerCache();
        } else {
            return this.initMainContextCache();
        }
    }

    /**
     * Cache para Service Worker
     */
    async initServiceWorkerCache() {
        this.cache = await caches.open(this.cacheName);
        return true;
    }

    /**
     * Cache para contexto principal
     */
    async initMainContextCache() {
        // Verificar suporte a IndexedDB
        if ('indexedDB' in window) {
            this.db = await this.openIndexedDB();
        }

        // Fallback para localStorage
        this.hasLocalStorage = typeof Storage !== 'undefined';

        return true;
    }

    /**
     * Abrir IndexedDB
     */
    openIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.indexedDBName, this.indexedDBVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store principal para mangás
                if (!db.objectStoreNames.contains('manga')) {
                    const mangaStore = db.createObjectStore('manga', { keyPath: 'id' });
                    mangaStore.createIndex('lastUpdated', 'lastUpdated');
                    mangaStore.createIndex('type', 'type');
                }

                // Store para metadados e configurações
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Compressão de dados (opcional)
     */
    compress(data) {
        if (!this.config.compressionEnabled) return data;

        try {
            // Compressão simples usando JSON + base64
            const jsonString = JSON.stringify(data);
            return btoa(encodeURIComponent(jsonString));
        } catch (error) {
            console.warn('Falha na compressão, usando dados originais:', error);
            return data;
        }
    }

    /**
     * Descompressão de dados
     */
    decompress(compressedData) {
        if (!this.config.compressionEnabled || typeof compressedData !== 'string') {
            return compressedData;
        }

        try {
            const jsonString = decodeURIComponent(atob(compressedData));
            return JSON.parse(jsonString);
        } catch (error) {
            console.warn('Falha na descompressão, usando dados originais:', error);
            return compressedData;
        }
    }

    /**
     * Verificar se dados estão expirados
     */
    isExpired(timestamp) {
        return Date.now() - timestamp > this.config.maxAge;
    }

    /**
     * Salvar no cache (contexto principal)
     */
    async setMainContext(key, data, metadata = {}) {
        const cacheEntry = {
            data: this.compress(data),
            timestamp: Date.now(),
            metadata,
            version: metadata.version || 1
        };

        // Tentar IndexedDB primeiro
        if (this.db) {
            try {
                const transaction = this.db.transaction(['metadata'], 'readwrite');
                const store = transaction.objectStore('metadata');
                await store.put({ key, ...cacheEntry });
                return true;
            } catch (error) {
                console.warn('Falha no IndexedDB, usando localStorage:', error);
            }
        }

        // Fallback para localStorage
        if (this.hasLocalStorage) {
            try {
                const serialized = JSON.stringify(cacheEntry);

                // Verificar limite de tamanho
                if (serialized.length > this.config.maxSize) {
                    console.warn('Dados muito grandes para localStorage, realizando limpeza...');
                    await this.cleanup();
                }

                localStorage.setItem(`gikamura_${key}`, serialized);
                return true;
            } catch (error) {
                console.error('Falha ao salvar no localStorage:', error);
                return false;
            }
        }

        return false;
    }

    /**
     * Recuperar do cache (contexto principal)
     */
    async getMainContext(key) {
        // Tentar IndexedDB primeiro
        if (this.db) {
            try {
                const transaction = this.db.transaction(['metadata'], 'readonly');
                const store = transaction.objectStore('metadata');
                const result = await store.get(key);

                if (result && !this.isExpired(result.timestamp)) {
                    return {
                        data: this.decompress(result.data),
                        metadata: result.metadata,
                        version: result.version
                    };
                }
            } catch (error) {
                console.warn('Falha ao ler IndexedDB:', error);
            }
        }

        // Fallback para localStorage
        if (this.hasLocalStorage) {
            try {
                const serialized = localStorage.getItem(`gikamura_${key}`);
                if (!serialized) return null;

                const cacheEntry = JSON.parse(serialized);

                if (this.isExpired(cacheEntry.timestamp)) {
                    localStorage.removeItem(`gikamura_${key}`);
                    return null;
                }

                return {
                    data: this.decompress(cacheEntry.data),
                    metadata: cacheEntry.metadata || {},
                    version: cacheEntry.version || 1
                };
            } catch (error) {
                console.error('Falha ao ler localStorage:', error);
                return null;
            }
        }

        return null;
    }

    /**
     * Cache para Service Worker
     */
    async setServiceWorker(url, response) {
        try {
            await this.cache.put(url, response.clone());
            return true;
        } catch (error) {
            console.error('Falha ao cachear no Service Worker:', error);
            return false;
        }
    }

    /**
     * Recuperar do Service Worker cache
     */
    async getServiceWorker(url) {
        try {
            return await this.cache.match(url);
        } catch (error) {
            console.error('Falha ao recuperar do Service Worker cache:', error);
            return null;
        }
    }

    /**
     * Interface unificada - SET
     */
    async set(key, data, metadata = {}) {
        if (this.isServiceWorker) {
            // Para SW, assumir que key é uma URL
            return this.setServiceWorker(key, data);
        } else {
            return this.setMainContext(key, data, metadata);
        }
    }

    /**
     * Interface unificada - GET
     */
    async get(key) {
        if (this.isServiceWorker) {
            return this.getServiceWorker(key);
        } else {
            return this.getMainContext(key);
        }
    }

    /**
     * Limpeza automática de cache
     */
    async cleanup() {
        if (this.isServiceWorker) {
            return this.cleanupServiceWorker();
        } else {
            return this.cleanupMainContext();
        }
    }

    /**
     * Limpeza do contexto principal
     */
    async cleanupMainContext() {
        let cleanedCount = 0;

        // Limpeza do localStorage
        if (this.hasLocalStorage) {
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key.startsWith('gikamura_')) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        if (this.isExpired(data.timestamp)) {
                            localStorage.removeItem(key);
                            cleanedCount++;
                        }
                    } catch (error) {
                        // Remove entradas corrompidas
                        localStorage.removeItem(key);
                        cleanedCount++;
                    }
                }
            }
        }

        // Limpeza do IndexedDB
        if (this.db) {
            try {
                const transaction = this.db.transaction(['metadata'], 'readwrite');
                const store = transaction.objectStore('metadata');
                const cursor = await store.openCursor();

                while (cursor) {
                    if (this.isExpired(cursor.value.timestamp)) {
                        await cursor.delete();
                        cleanedCount++;
                    }
                    cursor = await cursor.continue();
                }
            } catch (error) {
                console.warn('Falha na limpeza do IndexedDB:', error);
            }
        }

        console.log(`Cache cleanup: ${cleanedCount} entradas removidas`);
        return cleanedCount;
    }

    /**
     * Limpeza do Service Worker
     */
    async cleanupServiceWorker() {
        try {
            const keys = await this.cache.keys();
            let cleanedCount = 0;

            for (const request of keys) {
                const response = await this.cache.match(request);
                const cacheDate = response.headers.get('date');

                if (cacheDate && this.isExpired(new Date(cacheDate).getTime())) {
                    await this.cache.delete(request);
                    cleanedCount++;
                }
            }

            console.log(`Service Worker cache cleanup: ${cleanedCount} entradas removidas`);
            return cleanedCount;
        } catch (error) {
            console.error('Falha na limpeza do Service Worker cache:', error);
            return 0;
        }
    }

    /**
     * Limpar tudo
     */
    async clear() {
        if (this.isServiceWorker) {
            const keys = await this.cache.keys();
            await Promise.all(keys.map(key => this.cache.delete(key)));
        } else {
            // Limpar localStorage
            if (this.hasLocalStorage) {
                const keys = Object.keys(localStorage);
                keys.filter(key => key.startsWith('gikamura_'))
                    .forEach(key => localStorage.removeItem(key));
            }

            // Limpar IndexedDB
            if (this.db) {
                const transaction = this.db.transaction(['metadata'], 'readwrite');
                const store = transaction.objectStore('metadata');
                await store.clear();
            }
        }
    }

    /**
     * Estatísticas do cache
     */
    async getStats() {
        const stats = {
            type: this.isServiceWorker ? 'service-worker' : 'main-context',
            entryCount: 0,
            totalSize: 0,
            expiredCount: 0
        };

        if (this.isServiceWorker) {
            const keys = await this.cache.keys();
            stats.entryCount = keys.length;
        } else {
            if (this.hasLocalStorage) {
                const keys = Object.keys(localStorage);
                const gikamuraKeys = keys.filter(key => key.startsWith('gikamura_'));

                for (const key of gikamuraKeys) {
                    const value = localStorage.getItem(key);
                    stats.totalSize += value.length;

                    try {
                        const data = JSON.parse(value);
                        if (this.isExpired(data.timestamp)) {
                            stats.expiredCount++;
                        }
                    } catch (error) {
                        stats.expiredCount++;
                    }
                }

                stats.entryCount = gikamuraKeys.length;
            }
        }

        return stats;
    }
}

// Exportar para ambos os contextos
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
    // Web Worker / Service Worker
    self.CacheCoordinator = CacheCoordinator;
} else if (typeof window !== 'undefined') {
    // Browser main thread
    window.CacheCoordinator = CacheCoordinator;
} else if (typeof module !== 'undefined' && module.exports) {
    // Node.js
    module.exports = CacheCoordinator;
}