/**
 * Sistema de fallback de imagens para garantir que TODAS as capas sejam visíveis
 * Implementa múltiplas estratégias de recuperação e validação de URLs
 */

class ImageFallbackSystem {
    constructor() {
        this.workingUrls = new Set();
        this.failedUrls = new Set();
        this.retryAttempts = new Map();
        this.maxRetries = 3;

        // URLs de fallback confiáveis
        this.fallbackServices = [
            'https://via.placeholder.com/{width}x{height}/1f2937/ef4444?text=',
            'https://dummyimage.com/{width}x{height}/1f2937/ef4444&text=',
            'https://picsum.photos/{width}/{height}?grayscale&blur=2'
        ];
    }

    /**
     * Garante que uma URL de imagem funcione ou retorna um fallback
     */
    async ensureImageWorks(url, width = 256, height = 384) {
        if (!url) {
            return this.getFallbackUrl(width, height, 'Sem Imagem');
        }

        // Se já sabemos que funciona, retorna imediatamente
        if (this.workingUrls.has(url)) {
            return url;
        }

        // Se já sabemos que falha, retorna fallback
        if (this.failedUrls.has(url)) {
            return this.getFallbackUrl(width, height, 'Indisponível');
        }

        // Testa a URL
        try {
            const isWorking = await this.testImageUrl(url);
            if (isWorking) {
                this.workingUrls.add(url);
                return url;
            } else {
                this.failedUrls.add(url);
                return this.getFallbackUrl(width, height, 'Erro');
            }
        } catch (error) {
            console.warn('Erro ao testar URL de imagem:', url, error);
            this.failedUrls.add(url);
            return this.getFallbackUrl(width, height, 'Erro');
        }
    }

    /**
     * Testa se uma URL de imagem funciona
     */
    testImageUrl(url) {
        return new Promise((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => {
                resolve(false);
            }, 5000); // 5 segundos timeout

            img.onload = () => {
                clearTimeout(timeout);
                resolve(true);
            };

            img.onerror = () => {
                clearTimeout(timeout);
                resolve(false);
            };

            // Tenta carregar sem CORS primeiro
            img.crossOrigin = 'anonymous';
            img.src = url;
        });
    }

    /**
     * Gera URL de fallback confiável
     */
    getFallbackUrl(width, height, text) {
        const encodedText = encodeURIComponent(text);
        // Usa via.placeholder.com como principal por ser muito confiável
        return `https://via.placeholder.com/${width}x${height}/1f2937/ef4444?text=${encodedText}`;
    }

    /**
     * Converte URL do mangalivre para proxy se necessário
     */
    getProxiedUrl(originalUrl) {
        if (!originalUrl || !originalUrl.includes('mangalivre.tv')) {
            return originalUrl;
        }

        // Estratégias de proxy para mangalivre.tv
        const proxyStrategies = [
            // Usar serviços de proxy de imagem
            `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl)}&w=256&h=384&fit=cover`,
            `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=256&h=384&fit=cover`,
            // Tentar acessar diretamente com diferentes user agents via fetch
            originalUrl
        ];

        return proxyStrategies[0]; // Retorna o primeiro proxy por padrão
    }

    /**
     * Aplica sistema de fallback a todas as imagens lazy-loading
     */
    async enhanceAllImages() {
        const lazyImages = document.querySelectorAll('img.lazy-image');

        for (const img of lazyImages) {
            const originalSrc = img.dataset.src || img.src;
            if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.includes('placeholder')) {
                // Tenta versão com proxy primeiro
                const proxiedUrl = this.getProxiedUrl(originalSrc);
                const workingUrl = await this.ensureImageWorks(proxiedUrl);

                if (workingUrl !== proxiedUrl) {
                    // Se o proxy falhou, tenta o original
                    const originalWorking = await this.ensureImageWorks(originalSrc);
                    img.dataset.src = originalWorking;
                } else {
                    img.dataset.src = workingUrl;
                }
            }
        }
    }

    /**
     * Monitora imagens que falharam ao carregar e aplica fallback imediato
     */
    setupErrorHandling() {
        document.addEventListener('error', (event) => {
            if (event.target.tagName === 'IMG') {
                const img = event.target;
                const originalSrc = img.src;

                if (!originalSrc.includes('placeholder') && !originalSrc.startsWith('data:')) {
                    console.warn('Imagem falhou ao carregar:', originalSrc);
                    this.failedUrls.add(originalSrc);

                    // Aplica fallback imediato
                    const rect = img.getBoundingClientRect();
                    const width = rect.width || 256;
                    const height = rect.height || 384;
                    img.src = this.getFallbackUrl(Math.round(width), Math.round(height), 'Erro');
                }
            }
        }, true);
    }

    /**
     * Força o carregamento de todas as imagens visíveis
     */
    forceLoadVisibleImages() {
        const visibleImages = document.querySelectorAll('img.lazy-image');

        visibleImages.forEach(img => {
            const rect = img.getBoundingClientRect();
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

            if (isVisible && img.dataset.src && !img.src.includes(img.dataset.src)) {
                img.src = img.dataset.src;
            }
        });
    }
}

// Instância global
export const imageFallbackSystem = new ImageFallbackSystem();

// Auto-inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        imageFallbackSystem.setupErrorHandling();

        // Executa verificação inicial após 1 segundo
        setTimeout(() => {
            imageFallbackSystem.enhanceAllImages();
        }, 1000);

        // Força carregamento de imagens visíveis a cada 2 segundos
        setInterval(() => {
            imageFallbackSystem.forceLoadVisibleImages();
        }, 2000);
    });
} else {
    imageFallbackSystem.setupErrorHandling();
    setTimeout(() => {
        imageFallbackSystem.enhanceAllImages();
    }, 100);
}