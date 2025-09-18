/**
 * Sistema de gestos touch para navegação mobile
 */
export class TouchGestureHandler {
    constructor(element, callbacks = {}) {
        this.element = element;
        this.callbacks = callbacks;
        this.startX = 0;
        this.startY = 0;
        this.startTime = 0;
        this.threshold = 50;
        this.maxTime = 300;
        this.isScrolling = false;

        this.setupListeners();
    }

    setupListeners() {
        // Passive listeners para melhor performance
        this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
        this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        this.element.addEventListener('touchcancel', this.handleTouchCancel.bind(this), { passive: true });
    }

    handleTouchStart(e) {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.startTime = Date.now();
        this.isScrolling = false;
    }

    handleTouchMove(e) {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - this.startX);
        const deltaY = Math.abs(touch.clientY - this.startY);

        // Detectar se é scroll vertical
        if (deltaY > deltaX && deltaY > 10) {
            this.isScrolling = true;
        }
    }

    handleTouchEnd(e) {
        if (e.changedTouches.length !== 1 || this.isScrolling) return;

        const touch = e.changedTouches[0];
        const endX = touch.clientX;
        const endY = touch.clientY;
        const endTime = Date.now();

        const deltaX = endX - this.startX;
        const deltaY = endY - this.startY;
        const deltaTime = endTime - this.startTime;

        // Verificar se é um swipe válido
        if (deltaTime > this.maxTime) return;
        if (Math.abs(deltaY) > Math.abs(deltaX)) return;
        if (Math.abs(deltaX) < this.threshold) return;

        // Determinar direção e executar callback
        if (deltaX > 0) {
            this.callbacks.onSwipeRight?.(deltaX, deltaTime);
        } else {
            this.callbacks.onSwipeLeft?.(Math.abs(deltaX), deltaTime);
        }
    }

    handleTouchCancel() {
        this.isScrolling = false;
    }

    destroy() {
        this.element.removeEventListener('touchstart', this.handleTouchStart);
        this.element.removeEventListener('touchmove', this.handleTouchMove);
        this.element.removeEventListener('touchend', this.handleTouchEnd);
        this.element.removeEventListener('touchcancel', this.handleTouchCancel);
    }
}

/**
 * Gerenciador de navegação por gestos
 */
export class GestureNavigationManager {
    constructor(store) {
        this.store = store;
        this.gestureHandlers = new Map();
        this.setupGestures();
    }

    setupGestures() {
        // Gestos para navegação de páginas
        const paginationContainer = document.getElementById('content-container');
        if (paginationContainer) {
            const paginationGestures = new TouchGestureHandler(paginationContainer, {
                onSwipeLeft: () => this.nextPage(),
                onSwipeRight: () => this.previousPage()
            });
            this.gestureHandlers.set('pagination', paginationGestures);
        }

        // Gestos para tabs
        const tabsContainer = document.getElementById('tabs');
        if (tabsContainer) {
            const tabGestures = new TouchGestureHandler(tabsContainer, {
                onSwipeLeft: () => this.nextTab(),
                onSwipeRight: () => this.previousTab()
            });
            this.gestureHandlers.set('tabs', tabGestures);
        }

        // Detectar dispositivos touch
        this.addTouchIndicators();
    }

    nextPage() {
        const state = this.store.getState();
        const { allManga, favorites, activeTab, currentPage, searchQuery, activeTypeFilter, activeStatusFilter } = state;

        let filteredData = this.getFilteredData(allManga, favorites, activeTab, searchQuery, activeTypeFilter, activeStatusFilter);
        const totalPages = Math.ceil(filteredData.length / 21); // ITEMS_PER_PAGE

        if (currentPage < totalPages) {
            this.store.setCurrentPage(currentPage + 1);
            this.provideFeedback('next');
        }
    }

    previousPage() {
        const state = this.store.getState();
        if (state.currentPage > 1) {
            this.store.setCurrentPage(state.currentPage - 1);
            this.provideFeedback('previous');
        }
    }

    nextTab() {
        const tabs = ['home', 'library', 'favorites', 'updates'];
        const currentIndex = tabs.indexOf(this.store.getState().activeTab);
        const nextIndex = (currentIndex + 1) % tabs.length;
        this.store.setActiveTab(tabs[nextIndex]);
        this.provideFeedback('tab-right');
    }

    previousTab() {
        const tabs = ['home', 'library', 'favorites', 'updates'];
        const currentIndex = tabs.indexOf(this.store.getState().activeTab);
        const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        this.store.setActiveTab(tabs[prevIndex]);
        this.provideFeedback('tab-left');
    }

    getFilteredData(allManga, favorites, activeTab, searchQuery, activeTypeFilter, activeStatusFilter) {
        let filteredData = [];

        switch (activeTab) {
            case 'home':
                filteredData = [...allManga].sort((a, b) => b.lastUpdated - a.lastUpdated).slice(0, 20);
                break;
            case 'library':
            case 'favorites':
                filteredData = activeTab === 'favorites'
                    ? allManga.filter(m => favorites.has(m.url))
                    : allManga;

                if (searchQuery) {
                    const query = searchQuery.toLowerCase();
                    filteredData = filteredData.filter(m =>
                        m.title.toLowerCase().includes(query) ||
                        (m.author && m.author.toLowerCase().includes(query)) ||
                        (m.description && m.description.toLowerCase().includes(query))
                    );
                }

                if (activeTypeFilter !== 'all') {
                    filteredData = filteredData.filter(m => m.type === activeTypeFilter);
                }

                if (activeStatusFilter !== 'all') {
                    filteredData = filteredData.filter(m => m.status === activeStatusFilter);
                }
                break;
        }

        return filteredData;
    }

    provideFeedback(type) {
        // Feedback háptico se suportado
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }

        // Feedback visual
        this.showSwipeIndicator(type);
    }

    showSwipeIndicator(type) {
        const indicator = document.createElement('div');
        indicator.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm font-medium z-50 pointer-events-none';

        const messages = {
            'next': '→ Próxima página',
            'previous': '← Página anterior',
            'tab-right': '→ Próxima aba',
            'tab-left': '← Aba anterior'
        };

        indicator.textContent = messages[type] || 'Navegação';
        document.body.appendChild(indicator);

        // Animação de fade
        indicator.style.opacity = '0';
        indicator.style.transition = 'opacity 0.3s ease-in-out';

        requestAnimationFrame(() => {
            indicator.style.opacity = '1';
        });

        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);
        }, 1500);
    }

    addTouchIndicators() {
        // Adicionar indicadores visuais para dispositivos touch
        if (!('ontouchstart' in window)) return;

        const style = document.createElement('style');
        style.textContent = `
            @media (hover: none) and (pointer: coarse) {
                .gesture-zone {
                    position: relative;
                }

                .gesture-zone::before {
                    content: '← swipe →';
                    position: absolute;
                    bottom: 0.5rem;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.25rem;
                    font-size: 0.75rem;
                    opacity: 0.6;
                    pointer-events: none;
                    z-index: 10;
                }

                .gesture-zone:hover::before {
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        // Adicionar classe aos elementos com gestos
        document.getElementById('content-container')?.classList.add('gesture-zone');
        document.getElementById('tabs')?.classList.add('touch-indicator');
    }

    destroy() {
        this.gestureHandlers.forEach(handler => handler.destroy());
        this.gestureHandlers.clear();
    }
}