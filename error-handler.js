/**
 * Sistema simplificado de tratamento de erros focado no que é realmente usado
 */

// Sistema de notificação de erros user-friendly com recovery
export class ErrorNotificationManager {
    constructor() {
        this.notificationQueue = [];
        this.isShowing = false;
        this.container = null;
        this.errorHistory = [];
        this.recoveryAttempts = new Map();
        this.maxRecoveryAttempts = 3;

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

    /**
     * Sistema de Recovery de Errors
     */
    logError(error, context = {}) {
        const errorRecord = {
            message: error.message || error,
            timestamp: Date.now(),
            context,
            stack: error.stack,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        };

        this.errorHistory.push(errorRecord);

        // Manter apenas os últimos 50 erros
        if (this.errorHistory.length > 50) {
            this.errorHistory.shift();
        }

        // Analytics local para padrões de erro
        if (typeof window !== 'undefined' && window.analytics) {
            window.analytics.trackError(error.message, context);
        }
    }

    async recoverFromError(error, context = {}) {
        const errorKey = `${error.message}_${context.operation || 'unknown'}`;
        const attempts = this.recoveryAttempts.get(errorKey) || 0;

        if (attempts >= this.maxRecoveryAttempts) {
            console.warn(`Máximo de tentativas de recovery atingido para: ${errorKey}`);
            return false;
        }

        this.recoveryAttempts.set(errorKey, attempts + 1);
        this.logError(error, { ...context, recoveryAttempt: attempts + 1 });

        try {
            switch (context.type) {
                case 'network':
                    return await this.recoverNetworkError(error, context);
                case 'cache':
                    return await this.recoverCacheError(error, context);
                case 'data':
                    return await this.recoverDataError(error, context);
                default:
                    return await this.genericRecovery(error, context);
            }
        } catch (recoveryError) {
            console.error('Falha na tentativa de recovery:', recoveryError);
            return false;
        }
    }

    async recoverNetworkError(error, context) {
        console.log('Tentando recovery de erro de rede...');

        // Verificar conectividade
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            this.showError(
                'Sem Conexão',
                'Verifique sua conexão com a internet e tente novamente',
                'warning',
                5000
            );
            return false;
        }

        // Aguardar antes de retry
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Tentar usar cache como fallback
        if (context.url && typeof window !== 'undefined' && window.cacheCoordinator) {
            try {
                const cachedData = await window.cacheCoordinator.get(context.url);
                if (cachedData) {
                    this.showError(
                        'Usando Dados Locais',
                        'Conectividade instável. Mostrando dados salvos.',
                        'warning',
                        3000
                    );
                    return cachedData;
                }
            } catch (cacheError) {
                console.warn('Falha ao acessar cache durante recovery:', cacheError);
            }
        }

        return false;
    }

    async recoverCacheError(error, context) {
        console.log('Tentando recovery de erro de cache...');

        try {
            // Limpar cache corrompido
            if (typeof localStorage !== 'undefined') {
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                    if (key.startsWith('gikamura_')) {
                        try {
                            JSON.parse(localStorage.getItem(key));
                        } catch (e) {
                            // Remove entradas corrompidas
                            localStorage.removeItem(key);
                            console.log(`Cache corrompido removido: ${key}`);
                        }
                    }
                }
            }

            // Tentar recriar cache
            if (typeof window !== 'undefined' && window.cacheCoordinator) {
                await window.cacheCoordinator.initialize();
            }

            this.showError(
                'Cache Limpo',
                'Cache foi reinicializado. Recarregando dados...',
                'info',
                3000
            );

            return true;
        } catch (recoveryError) {
            console.error('Falha na limpeza do cache:', recoveryError);
            return false;
        }
    }

    async recoverDataError(error, context) {
        console.log('Tentando recovery de erro de dados...');

        // Se há dados corrompidos, tentar usar backup
        if (context.backupData) {
            this.showError(
                'Usando Backup',
                'Dados principais indisponíveis. Usando backup.',
                'warning',
                4000
            );
            return context.backupData;
        }

        // Forçar recarregamento de dados
        if (context.reloadFunction && typeof context.reloadFunction === 'function') {
            try {
                await context.reloadFunction();
                return true;
            } catch (reloadError) {
                console.error('Falha no reload durante recovery:', reloadError);
            }
        }

        return false;
    }

    async genericRecovery(error, context) {
        console.log('Tentando recovery genérico...');

        // Aguardar um pouco e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Se há uma função de retry no contexto
        if (context.retryFunction && typeof context.retryFunction === 'function') {
            try {
                return await context.retryFunction();
            } catch (retryError) {
                console.error('Falha no retry durante recovery:', retryError);
            }
        }

        // Reload da página como último recurso (apenas se permitido)
        if (context.allowPageReload && typeof window !== 'undefined') {
            this.showError(
                'Recarregando Página',
                'Tentando resolver problema recarregando a aplicação...',
                'info',
                2000
            );

            setTimeout(() => {
                window.location.reload();
            }, 2000);

            return true;
        }

        return false;
    }

    clearErrorHistory() {
        this.errorHistory = [];
        this.recoveryAttempts.clear();
    }

    getErrorStats() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        const recentErrors = this.errorHistory.filter(
            error => now - error.timestamp < oneHour
        );

        const errorCounts = {};
        recentErrors.forEach(error => {
            const key = error.message.substring(0, 50);
            errorCounts[key] = (errorCounts[key] || 0) + 1;
        });

        return {
            totalErrors: this.errorHistory.length,
            recentErrors: recentErrors.length,
            errorFrequency: errorCounts,
            recoveryAttempts: Object.fromEntries(this.recoveryAttempts)
        };
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