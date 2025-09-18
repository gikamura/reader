/**
 * Sistema de Lazy Loading otimizado para imagens
 * Carrega imagens apenas quando ficam visíveis na tela
 */
class LazyImageLoader {
    constructor(options = {}) {
        this.options = {
            rootMargin: '50px',
            threshold: 0.1,
            placeholderSvg: this.createPlaceholderSvg(),
            errorSvg: this.createErrorSvg(),
            ...options
        };

        this.observer = null;
        this.loadedImages = new Set();
        this.failedImages = new Set();
        this.init();
    }

    init() {
        if (!('IntersectionObserver' in window)) {
            console.warn('IntersectionObserver não suportado, carregando todas as imagens');
            this.loadAllImages();
            return;
        }

        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            {
                rootMargin: this.options.rootMargin,
                threshold: this.options.threshold
            }
        );
    }

    createPlaceholderSvg() {
        return `data:image/svg+xml;base64,${btoa(`
            <svg width="256" height="384" viewBox="0 0 256 384" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="256" height="384" fill="#1f2937"/>
                <rect x="32" y="32" width="192" height="288" rx="8" fill="#374151"/>
                <circle cx="128" cy="160" r="24" fill="#4b5563"/>
                <path d="M104 184h48l-8 16h-32l-8-16z" fill="#4b5563"/>
                <rect x="64" y="240" width="128" height="8" rx="4" fill="#4b5563"/>
                <rect x="80" y="264" width="96" height="6" rx="3" fill="#374151"/>
            </svg>
        `)}`;
    }

    createErrorSvg() {
        return `data:image/svg+xml;base64,${btoa(`
            <svg width="256" height="384" viewBox="0 0 256 384" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="256" height="384" fill="#1f2937"/>
                <rect x="32" y="32" width="192" height="288" rx="8" fill="#374151"/>
                <circle cx="128" cy="160" r="32" fill="#ef4444"/>
                <path d="M112 144l32 32m0-32l-32 32" stroke="white" stroke-width="3" stroke-linecap="round"/>
                <text x="128" y="220" text-anchor="middle" fill="#ef4444" font-family="Inter, sans-serif" font-size="12">Erro ao carregar</text>
            </svg>
        `)}`;
    }

    observe(img) {
        if (!img || !(img instanceof HTMLImageElement)) {
            console.warn('Elemento inválido para lazy loading:', img);
            return;
        }

        // Se já foi carregada, ignorar
        if (this.loadedImages.has(img.src)) {
            return;
        }

        // Configurar atributos para lazy loading
        const originalSrc = img.src || img.dataset.src;
        if (!originalSrc) {
            console.warn('Imagem sem src definido para lazy loading');
            return;
        }

        // Armazenar URL original
        img.dataset.originalSrc = originalSrc;

        // Definir placeholder
        img.src = this.options.placeholderSvg;
        img.classList.add('lazy-loading');

        // Adicionar estilo de transição
        img.style.transition = 'opacity 0.3s ease-in-out';
        img.style.opacity = '0.7';

        if (this.observer) {
            this.observer.observe(img);
        } else {
            // Fallback para navegadores sem IntersectionObserver
            this.loadImage(img);
        }
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                this.loadImage(img);
                this.observer.unobserve(img);
            }
        });
    }

    async loadImage(img) {
        const originalSrc = img.dataset.originalSrc;

        if (!originalSrc || this.loadedImages.has(originalSrc)) {
            return;
        }

        try {
            // Pré-carregar a imagem
            const imageLoader = new Image();
            imageLoader.crossOrigin = 'anonymous';

            await new Promise((resolve, reject) => {
                imageLoader.onload = resolve;
                imageLoader.onerror = reject;
                imageLoader.src = originalSrc;
            });

            // Aplicar a imagem carregada
            img.src = originalSrc;
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-loaded');
            img.style.opacity = '1';

            this.loadedImages.add(originalSrc);

            // Trigger evento customizado
            img.dispatchEvent(new CustomEvent('lazyloaded', {
                detail: { originalSrc }
            }));

        } catch (error) {
            console.warn(`Falha ao carregar imagem: ${originalSrc}`, error);

            // Aplicar imagem de erro
            img.src = this.options.errorSvg;
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-error');
            img.style.opacity = '1';

            this.failedImages.add(originalSrc);

            // Trigger evento de erro
            img.dispatchEvent(new CustomEvent('lazyerror', {
                detail: { originalSrc, error }
            }));
        }
    }

    loadAllImages() {
        // Fallback: carregar todas as imagens com lazy-loading
        document.querySelectorAll('img[data-original-src], img.lazy-loading').forEach(img => {
            this.loadImage(img);
        });
    }

    observeMultiple(images) {
        images.forEach(img => this.observe(img));
    }

    unobserve(img) {
        if (this.observer) {
            this.observer.unobserve(img);
        }
    }

    disconnect() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }

    getStats() {
        return {
            loaded: this.loadedImages.size,
            failed: this.failedImages.size,
            total: this.loadedImages.size + this.failedImages.size
        };
    }
}

// Instância global do lazy loader
export const lazyLoader = new LazyImageLoader();

// Auto-inicializar se o DOM já estiver carregado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Observer para imagens adicionadas dinamicamente
        const imageObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const images = node.querySelectorAll ?
                            node.querySelectorAll('img') :
                            (node.tagName === 'IMG' ? [node] : []);

                        images.forEach(img => lazyLoader.observe(img));
                    }
                });
            });
        });

        imageObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}