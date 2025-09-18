// Service Worker simplificado para evitar problemas de dependências
const CACHE_VERSION = 'gikamura-v1.4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
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
    './local-analytics.js',
    './manifest.json'
];

const NOTIFICATION_TAG = 'gikamura-update';

// Install event
self.addEventListener('install', (event) => {
    console.log('Service Worker instalando...');
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        }).catch(error => {
            console.warn('Erro ao instalar cache:', error);
        })
    );
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('Service Worker ativando...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => !name.startsWith(CACHE_VERSION))
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', (event) => {
    // Filtrar apenas requests válidos
    if (event.request.method !== 'GET') return;

    // Filtrar esquemas não suportados
    const url = new URL(event.request.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return; // Ignorar chrome-extension:, moz-extension:, etc.
    }

    event.respondWith(
        handleRequest(event.request)
    );
});

async function handleRequest(request) {
    const url = new URL(request.url);

    try {
        // Estratégia baseada no tipo de recurso
        if (isStaticAsset(url)) {
            return await cacheFirst(request);
        } else if (isImage(url)) {
            return await cacheFirst(request);
        } else if (isAPI(url)) {
            return await networkFirst(request);
        } else {
            return await staleWhileRevalidate(request);
        }
    } catch (error) {
        // Não logar erros CORS como críticos
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
            console.warn('Fetch falhou (possivelmente CORS):', request.url);
        } else {
            console.error('Erro no fetch:', error);
        }
        return await handleError(request);
    }
}

function isStaticAsset(url) {
    return STATIC_ASSETS.some(asset =>
        url.pathname.endsWith(asset.replace('./', ''))
    );
}

function isImage(url) {
    return url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/);
}

function isAPI(url) {
    return url.pathname.includes('api') ||
           url.hostname.includes('github') ||
           url.hostname.includes('raw.githubusercontent');
}

async function cacheFirst(request) {
    // Verificar se o request é válido para cache
    const requestUrl = new URL(request.url);
    if (requestUrl.protocol !== 'https:' && requestUrl.protocol !== 'http:') {
        return fetch(request); // Não cachear, apenas fazer fetch
    }

    const cacheName = getCacheName(request);
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            // Verificar novamente antes de cachear
            if (requestUrl.protocol === 'https:' || requestUrl.protocol === 'http:') {
                cache.put(request, networkResponse.clone());
            }
        }
        return networkResponse;
    } catch (fetchError) {
        // Se fetch falhar, não tentar cachear
        throw fetchError;
    }
}

async function networkFirst(request) {
    const cacheName = getCacheName(request);
    const cache = await caches.open(cacheName);

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

async function staleWhileRevalidate(request) {
    const cacheName = getCacheName(request);
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    // Tentar atualizar em background
    fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
    }).catch(() => {
        // Ignorar erros de revalidação
    });

    return cachedResponse || await fetch(request);
}

function getCacheName(request) {
    const url = new URL(request.url);

    if (isImage(url)) {
        return IMAGE_CACHE;
    } else if (isAPI(url)) {
        return API_CACHE;
    } else if (isStaticAsset(url)) {
        return STATIC_CACHE;
    } else {
        return DYNAMIC_CACHE;
    }
}

async function handleError(request) {
    // Tentar resposta em cache como último recurso
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
        const cache = await caches.open(name);
        const response = await cache.match(request);
        if (response) {
            return response;
        }
    }

    // Resposta de erro para documentos
    if (request.destination === 'document') {
        return new Response(
            `<!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Gikamura - Offline</title>
                <style>
                    body {
                        font-family: Inter, sans-serif;
                        background: #050505;
                        color: #e5e7eb;
                        text-align: center;
                        padding: 2rem;
                        margin: 0;
                    }
                    .container {
                        max-width: 400px;
                        margin: 0 auto;
                        padding: 2rem;
                        background: #1a1a1a;
                        border-radius: 1rem;
                    }
                    h1 { color: #3b82f6; margin-bottom: 1rem; }
                    button {
                        background: #3b82f6;
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 0.5rem;
                        cursor: pointer;
                        margin-top: 1rem;
                        font-size: 1rem;
                    }
                    button:hover { background: #2563eb; }
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
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
        );
    }

    throw new Error('Recurso não disponível offline');
}

// Periodic sync para verificar atualizações
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-for-updates') {
        event.waitUntil(handleUpdateCheck());
    }
});

async function handleUpdateCheck() {
    try {
        console.log('Verificando atualizações em background...');

        // Implementação básica de verificação de updates
        // Pode ser expandida futuramente
        const response = await fetch('https://raw.githubusercontent.com/gikawork/data/refs/heads/main/hub/index.json');

        if (response.ok) {
            console.log('Verificação de atualizações concluída');
        }
    } catch (error) {
        console.warn('Erro na verificação de atualizações:', error);
    }
}

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/#updates')
    );
});

console.log('Service Worker carregado com sucesso');