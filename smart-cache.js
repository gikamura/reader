/**
 * Sistema de cache inteligente para Service Worker
 */
export class SmartCacheManager {
    constructor() {
        this.CACHE_VERSION = 'gikamura-v1.4';
        this.STATIC_CACHE = `${this.CACHE_VERSION}-static`;
        this.DYNAMIC_CACHE = `${this.CACHE_VERSION}-dynamic`;
        this.IMAGE_CACHE = `${this.CACHE_VERSION}-images`;
        this.API_CACHE = `${this.CACHE_VERSION}-api`;

        this.MAX_CACHE_SIZE = {
            static: 50,
            dynamic: 100,
            images: 200,
            api: 50
        };

        this.CACHE_STRATEGIES = {
            'static': 'cacheFirst',
            'images': 'cacheFirst',
            'api': 'networkFirst',
            'dynamic': 'staleWhileRevalidate'
        };

        this.STATIC_ASSETS = [
            './',
            './index.html',
            './app.js',
            './store.js',
            './ui.js',
            './api.js',
            './cache.js',
            './constants.js',
            './lazy-loader.js',
            './error-handler.js',
            './smart-debounce.js',
            './touch-gestures.js',
            './smart-cache.js',
            './manifest.json'
        ];
    }

    async install() {
        try {
            console.log('Instalando Service Worker com cache inteligente');

            // Cache de assets estáticos
            const staticCache = await caches.open(this.STATIC_CACHE);
            await staticCache.addAll(this.STATIC_ASSETS);

            // Preparar outros caches
            await caches.open(this.DYNAMIC_CACHE);
            await caches.open(this.IMAGE_CACHE);
            await caches.open(this.API_CACHE);

            console.log('Cache inicial configurado');
        } catch (error) {
            console.error('Erro ao instalar cache:', error);
        }
    }

    async activate() {
        try {
            console.log('Ativando Service Worker');

            // Limpar caches antigos
            const cacheNames = await caches.keys();
            const deletePromises = cacheNames
                .filter(name => !name.startsWith(this.CACHE_VERSION))
                .map(name => caches.delete(name));

            await Promise.all(deletePromises);

            // Limpar caches que excedem o tamanho máximo
            await this.cleanupCaches();

            console.log('Cleanup de cache concluído');
        } catch (error) {
            console.error('Erro ao ativar cache:', error);
        }
    }

    async handleRequest(request) {
        const url = new URL(request.url);
        const strategy = this.getStrategyForRequest(url);

        try {
            switch (strategy) {
                case 'cacheFirst':
                    return await this.cacheFirst(request);
                case 'networkFirst':
                    return await this.networkFirst(request);
                case 'staleWhileRevalidate':
                    return await this.staleWhileRevalidate(request);
                default:
                    return await fetch(request);
            }
        } catch (error) {
            console.error('Erro ao processar request:', error);
            return await this.handleError(request, error);
        }
    }

    getStrategyForRequest(url) {
        // API requests
        if (url.pathname.includes('api') || url.hostname.includes('github') || url.hostname.includes('raw.githubusercontent')) {
            return 'networkFirst';
        }

        // Imagens
        if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
            return 'cacheFirst';
        }

        // Assets estáticos
        if (this.STATIC_ASSETS.some(asset => url.pathname.endsWith(asset.replace('./', '')))) {
            return 'cacheFirst';
        }

        // Scripts e CSS externos
        if (url.pathname.match(/\.(js|css)$/) && url.hostname !== location.hostname) {
            return 'staleWhileRevalidate';
        }

        // Default
        return 'networkFirst';
    }

    async cacheFirst(request) {
        const cacheName = this.getCacheNameForRequest(request);
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            // Verificar se precisa revalidar em background
            this.backgroundRevalidate(request, cache);
            return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            await this.addToCache(cache, request, networkResponse.clone());
        }

        return networkResponse;
    }

    async networkFirst(request) {
        const cacheName = this.getCacheNameForRequest(request);
        const cache = await caches.open(cacheName);

        try {
            const networkResponse = await fetch(request);
            if (networkResponse.ok) {
                await this.addToCache(cache, request, networkResponse.clone());
            }
            return networkResponse;
        } catch (error) {
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                console.log('Fallback para cache devido a erro de rede:', error);
                return cachedResponse;
            }
            throw error;
        }
    }

    async staleWhileRevalidate(request) {
        const cacheName = this.getCacheNameForRequest(request);
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);

        // Sempre tentar revalidar em background
        const networkPromise = fetch(request).then(response => {
            if (response.ok) {
                this.addToCache(cache, request, response.clone());
            }
            return response;
        }).catch(error => {
            console.warn('Falha na revalidação em background:', error);
        });

        return cachedResponse || await networkPromise;
    }

    async backgroundRevalidate(request, cache) {
        try {
            const response = await fetch(request);
            if (response.ok) {
                await this.addToCache(cache, request, response.clone());
            }
        } catch (error) {
            console.warn('Falha na revalidação em background:', error);
        }
    }

    getCacheNameForRequest(request) {
        const url = new URL(request.url);

        if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
            return this.IMAGE_CACHE;
        }

        if (url.pathname.includes('api') || url.hostname.includes('github')) {
            return this.API_CACHE;
        }

        if (this.STATIC_ASSETS.some(asset => url.pathname.endsWith(asset.replace('./', '')))) {
            return this.STATIC_CACHE;
        }

        return this.DYNAMIC_CACHE;
    }

    async addToCache(cache, request, response) {
        try {
            await cache.put(request, response);

            // Verificar tamanho do cache
            const cacheName = await this.getCacheNameFromCache(cache);
            await this.limitCacheSize(cacheName);
        } catch (error) {
            console.warn('Erro ao adicionar ao cache:', error);
        }
    }

    async getCacheNameFromCache(cache) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
            const c = await caches.open(name);
            if (c === cache) return name;
        }
        return this.DYNAMIC_CACHE;
    }

    async limitCacheSize(cacheName) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();

        const maxSize = this.getMaxSizeForCache(cacheName);

        if (keys.length > maxSize) {
            const deleteCount = keys.length - maxSize;
            const keysToDelete = keys.slice(0, deleteCount);

            await Promise.all(keysToDelete.map(key => cache.delete(key)));
            console.log(`Removidos ${deleteCount} itens do cache ${cacheName}`);
        }
    }

    getMaxSizeForCache(cacheName) {
        if (cacheName.includes('static')) return this.MAX_CACHE_SIZE.static;
        if (cacheName.includes('images')) return this.MAX_CACHE_SIZE.images;
        if (cacheName.includes('api')) return this.MAX_CACHE_SIZE.api;
        return this.MAX_CACHE_SIZE.dynamic;
    }

    async cleanupCaches() {
        const cacheNames = await caches.keys();
        const currentCaches = cacheNames.filter(name => name.startsWith(this.CACHE_VERSION));

        for (const cacheName of currentCaches) {
            await this.limitCacheSize(cacheName);
        }
    }

    async handleError(request, error) {
        // Tentar resposta em cache como último recurso
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
            const cache = await caches.open(name);
            const response = await cache.match(request);
            if (response) {
                console.log('Fallback de emergência para cache:', request.url);
                return response;
            }
        }

        // Resposta de erro customizada
        if (request.destination === 'document') {
            return new Response(
                `<!DOCTYPE html>
                <html>
                <head>
                    <title>Gikamura - Offline</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: Inter, sans-serif;
                            background: #050505;
                            color: #e5e7eb;
                            text-align: center;
                            padding: 2rem;
                        }
                        .container { max-width: 400px; margin: 0 auto; }
                        h1 { color: #3b82f6; }
                        button {
                            background: #3b82f6;
                            color: white;
                            border: none;
                            padding: 0.75rem 1.5rem;
                            border-radius: 0.5rem;
                            cursor: pointer;
                            margin-top: 1rem;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🔌 Modo Offline</h1>
                        <p>Você está offline no momento. Algumas funcionalidades podem estar limitadas.</p>
                        <button onclick="window.location.reload()">Tentar Novamente</button>
                    </div>
                </body>
                </html>`,
                {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' }
                }
            );
        }

        throw error;
    }

    async getStats() {
        const cacheNames = await caches.keys();
        const stats = {};

        for (const name of cacheNames) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            stats[name] = {
                count: keys.length,
                maxSize: this.getMaxSizeForCache(name)
            };
        }

        return stats;
    }

    async clearAllCaches() {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('Todos os caches foram limpos');
    }
}

/**
 * Sistema de cache preditivo
 */
export class PredictiveCache {
    constructor(cacheManager) {
        this.cacheManager = cacheManager;
        this.accessPatterns = new Map();
        this.prefetchQueue = [];
        this.isProcessing = false;
    }

    recordAccess(url, type = 'view') {
        const pattern = this.accessPatterns.get(url) || {
            count: 0,
            lastAccess: 0,
            type: type,
            related: []
        };

        pattern.count++;
        pattern.lastAccess = Date.now();
        this.accessPatterns.set(url, pattern);

        // Trigger prefetch baseado no padrão
        this.scheduleRelatedPrefetch(url);
    }

    async scheduleRelatedPrefetch(currentUrl) {
        // Algoritmo simples: se usuário visita uma obra, pre-carregar outras do mesmo autor/gênero
        const relatedUrls = this.findRelatedContent(currentUrl);

        relatedUrls.forEach(url => {
            if (!this.prefetchQueue.includes(url)) {
                this.prefetchQueue.push(url);
            }
        });

        if (!this.isProcessing) {
            this.processPrefetchQueue();
        }
    }

    findRelatedContent(url) {
        // Em uma implementação real, isso analisaria metadados
        // Por agora, retorna array vazio
        return [];
    }

    async processPrefetchQueue() {
        if (this.prefetchQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const url = this.prefetchQueue.shift();

        try {
            // Prefetch com baixa prioridade
            await fetch(url, {
                mode: 'no-cors',
                priority: 'low'
            });
            console.log('Prefetch concluído:', url);
        } catch (error) {
            console.warn('Prefetch falhou:', url, error);
        }

        // Continuar processamento após delay
        setTimeout(() => this.processPrefetchQueue(), 1000);
    }

    getPopularContent(limit = 10) {
        return Array.from(this.accessPatterns.entries())
            .sort(([,a], [,b]) => b.count - a.count)
            .slice(0, limit)
            .map(([url, pattern]) => ({ url, ...pattern }));
    }

    getRecentContent(limit = 10) {
        return Array.from(this.accessPatterns.entries())
            .sort(([,a], [,b]) => b.lastAccess - a.lastAccess)
            .slice(0, limit)
            .map(([url, pattern]) => ({ url, ...pattern }));
    }
}

// Instâncias globais para Service Worker
export const smartCacheManager = new SmartCacheManager();
export const predictiveCache = new PredictiveCache(smartCacheManager);