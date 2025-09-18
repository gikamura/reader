/**
 * Sistema robusto de tratamento de erros e retry com fallback
 */
class RetryHandler {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
    }

    async executeWithRetry(fn, ...args) {
        let lastError;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn(...args);
            } catch (error) {
                lastError = error;

                if (attempt === this.maxRetries) break;

                // Exponential backoff com jitter
                const delay = this.baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
                console.warn(`Tentativa ${attempt + 1} falhou, retry em ${delay}ms:`, error.message);

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }
}

class ProxyManager {
    constructor(proxies) {
        this.proxies = [...proxies];
        this.currentIndex = 0;
        this.failureCount = new Map();
        this.resetInterval = 5 * 60 * 1000; // 5 minutos

        // Reset counters periodicamente
        setInterval(() => this.resetFailureCounts(), this.resetInterval);
    }

    getNextProxy() {
        // Encontrar proxy com menos falhas
        let bestProxy = this.proxies[0];
        let minFailures = this.failureCount.get(bestProxy) || 0;

        for (const proxy of this.proxies) {
            const failures = this.failureCount.get(proxy) || 0;
            if (failures < minFailures) {
                bestProxy = proxy;
                minFailures = failures;
            }
        }

        return bestProxy;
    }

    recordFailure(proxy) {
        const current = this.failureCount.get(proxy) || 0;
        this.failureCount.set(proxy, current + 1);
    }

    recordSuccess(proxy) {
        // Reduzir contador de falhas em caso de sucesso
        const current = this.failureCount.get(proxy) || 0;
        if (current > 0) {
            this.failureCount.set(proxy, Math.max(0, current - 1));
        }
    }

    resetFailureCounts() {
        this.failureCount.clear();
        console.log('Contadores de falha de proxy resetados');
    }
}

export class RobustFetcher {
    constructor(proxies = []) {
        this.retryHandler = new RetryHandler(3, 1000);
        this.proxyManager = new ProxyManager(proxies);
        this.requestCache = new Map();
        this.cacheTimeout = 30000; // 30 segundos
    }

    async fetchWithFallback(url, options = {}) {
        const cacheKey = `${url}_${JSON.stringify(options)}`;

        // Verificar cache de request recente
        if (this.requestCache.has(cacheKey)) {
            const cached = this.requestCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.response.clone();
            }
        }

        const errors = [];
        const maxProxyTries = this.proxyManager.proxies.length;

        for (let proxyAttempt = 0; proxyAttempt < maxProxyTries; proxyAttempt++) {
            const proxy = this.proxyManager.getNextProxy();

            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                console.log(`Tentando com proxy: ${proxy}`);

                const response = await this.retryHandler.executeWithRetry(
                    this.fetchWithTimeout.bind(this),
                    proxyUrl,
                    { ...options, timeout: options.timeout || 20000 }
                );

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // Sucesso - atualizar cache e registrar sucesso do proxy
                this.proxyManager.recordSuccess(proxy);
                this.requestCache.set(cacheKey, {
                    response: response.clone(),
                    timestamp: Date.now()
                });

                return response;

            } catch (error) {
                console.error(`Falha com proxy ${proxy}:`, error.message);
                this.proxyManager.recordFailure(proxy);
                errors.push({ proxy, error: error.message });
            }
        }

        // Se chegou aqui, todos os proxies falharam
        const aggregatedError = new Error(
            `Todos os proxies falharam para ${url}. Erros: ${errors.map(e => `${e.proxy}: ${e.error}`).join('; ')}`
        );
        aggregatedError.details = errors;
        throw aggregatedError;
    }

    async fetchWithTimeout(resource, options = {}) {
        const { timeout = 20000, ...fetchOptions } = options;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(resource, {
                ...fetchOptions,
                signal: controller.signal
            });
            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout após ${timeout}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async fetchJson(url, options = {}) {
        const response = await this.fetchWithFallback(url, options);
        return await response.json();
    }

    clearCache() {
        this.requestCache.clear();
    }

    getStats() {
        return {
            cacheSize: this.requestCache.size,
            proxyFailures: Object.fromEntries(this.proxyManager.failureCount),
            proxies: this.proxyManager.proxies
        };
    }
}

// Sistema de notificação de erros user-friendly
export class ErrorNotificationManager {
    constructor() {
        this.notificationQueue = [];
        this.isShowing = false;
        this.container = null;

        // Só criar container se estivermos no browser
        if (typeof document !== 'undefined') {
            this.createContainer();
        }
    }

    createContainer() {
        if (typeof document === 'undefined') return;

        this.container = document.createElement('div');
        this.container.id = 'error-notifications';
        this.container.className = 'fixed top-4 right-4 z-50 space-y-2 max-w-sm';
        document.body.appendChild(this.container);
    }

    showError(title, message, type = 'error', duration = 5000) {
        if (typeof document === 'undefined' || !this.container) {
            console.warn('ErrorNotificationManager: DOM not available, logging error instead:', title, message);
            return null;
        }

        const notification = this.createNotification(title, message, type);
        this.container.appendChild(notification);

        // Animação de entrada
        setTimeout(() => notification.classList.add('show'), 100);

        // Auto-remover
        setTimeout(() => this.removeNotification(notification), duration);

        return notification;
    }

    createNotification(title, message, type) {
        if (typeof document === 'undefined') return null;

        const notification = document.createElement('div');
        notification.className = `error-notification ${type} transform translate-x-full opacity-0 transition-all duration-300 ease-out`;

        const bgColor = type === 'error' ? 'bg-red-600' :
                       type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600';

        notification.innerHTML = `
            <div class="${bgColor} text-white rounded-lg shadow-lg overflow-hidden">
                <div class="p-4">
                    <div class="flex items-start">
                        <div class="flex-shrink-0">
                            ${this.getIcon(type)}
                        </div>
                        <div class="ml-3 w-0 flex-1">
                            <p class="text-sm font-medium">${title}</p>
                            <p class="mt-1 text-sm opacity-90">${message}</p>
                        </div>
                        <div class="ml-4 flex-shrink-0 flex">
                            <button class="close-btn inline-flex text-white hover:text-gray-200 focus:outline-none">
                                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Adicionar evento de fechar
        notification.querySelector('.close-btn').addEventListener('click', () => {
            this.removeNotification(notification);
        });

        return notification;
    }

    getIcon(type) {
        switch (type) {
            case 'error':
                return `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>`;
            case 'warning':
                return `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                </svg>`;
            default:
                return `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>`;
        }
    }

    removeNotification(notification) {
        notification.classList.remove('show');
        notification.classList.add('translate-x-full', 'opacity-0');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    showNetworkError() {
        this.showError(
            'Problema de Conexão',
            'Verificando conexão com a internet. Tentando novamente...',
            'warning',
            3000
        );
    }

    showProxyError() {
        this.showError(
            'Servidor Temporariamente Indisponível',
            'Alguns serviços estão instáveis. Tentando alternativas...',
            'warning',
            4000
        );
    }

    showCriticalError(message) {
        this.showError(
            'Erro Crítico',
            message,
            'error',
            8000
        );
    }
}

// CSS para as notificações
const notificationStyles = `
    .error-notification.show {
        transform: translateX(0);
        opacity: 1;
    }

    .error-notification {
        max-width: 384px;
        margin-bottom: 0.5rem;
    }
`;

// Adicionar estilos ao documento (apenas no browser)
if (typeof document !== 'undefined' && !document.getElementById('error-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'error-notification-styles';
    style.textContent = notificationStyles;
    document.head.appendChild(style);
}

// Instâncias globais
export const errorNotificationManager = new ErrorNotificationManager();