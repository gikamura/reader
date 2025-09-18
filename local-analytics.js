/**
 * Sistema de telemetria e analytics local
 * Coleta dados de uso para melhorar a experiência sem enviar dados externos
 */
export class LocalAnalytics {
    constructor() {
        this.storageKey = 'gikamura_analytics';
        this.sessionKey = 'gikamura_session';
        this.maxEvents = 1000;
        this.maxSessions = 50;

        this.currentSession = this.initializeSession();
        this.events = this.loadEvents();
        this.sessions = this.loadSessions();

        this.setupEventListeners();
        this.startPerformanceTracking();
    }

    initializeSession() {
        return {
            id: this.generateId(),
            startTime: Date.now(),
            lastActivity: Date.now(),
            pageViews: 0,
            searches: 0,
            mangaViews: 0,
            favoriteActions: 0,
            errors: 0,
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            connection: this.getConnectionInfo()
        };
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getConnectionInfo() {
        if ('connection' in navigator) {
            const conn = navigator.connection;
            return {
                effectiveType: conn.effectiveType,
                downlink: conn.downlink,
                rtt: conn.rtt,
                saveData: conn.saveData
            };
        }
        return null;
    }

    track(eventName, properties = {}) {
        const event = {
            id: this.generateId(),
            name: eventName,
            properties: {
                ...properties,
                timestamp: Date.now(),
                sessionId: this.currentSession.id,
                url: window.location.href,
                userAgent: navigator.userAgent
            }
        };

        this.events.push(event);
        this.updateSession();

        // Manter apenas os eventos mais recentes
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(-this.maxEvents);
        }

        this.saveEvents();
        console.debug('Analytics event:', eventName, properties);
    }

    updateSession() {
        this.currentSession.lastActivity = Date.now();
    }

    // Eventos específicos do domínio
    trackPageView(page) {
        this.currentSession.pageViews++;
        this.track('page_view', {
            page: page,
            referrer: document.referrer
        });
    }

    trackMangaView(mangaUrl, title, source = 'unknown') {
        this.currentSession.mangaViews++;
        this.track('manga_view', {
            url: mangaUrl,
            title: title,
            source: source
        });
    }

    trackSearch(query, resultsCount, source = 'search_input') {
        this.currentSession.searches++;
        this.track('search', {
            query: query,
            resultsCount: resultsCount,
            queryLength: query.length,
            source: source
        });
    }

    trackFavoriteAction(mangaUrl, action, title = null) {
        this.currentSession.favoriteActions++;
        this.track('favorite_action', {
            url: mangaUrl,
            action: action, // 'add' ou 'remove'
            title: title
        });
    }

    trackError(error, context = {}) {
        this.currentSession.errors++;

        // Proteger contra errors null/undefined
        let errorMessage = 'Unknown error';
        let errorStack = null;

        if (error && typeof error === 'object') {
            errorMessage = error.message || error.toString();
            errorStack = error.stack || null;
        } else if (error) {
            errorMessage = error.toString();
        }

        this.track('error', {
            message: errorMessage,
            stack: errorStack,
            context: context,
            severity: context.severity || 'error'
        });
    }

    trackPerformance(metric, value, context = {}) {
        this.track('performance', {
            metric: metric,
            value: value,
            context: context
        });
    }

    trackUserInteraction(element, action, context = {}) {
        this.track('user_interaction', {
            element: element,
            action: action,
            context: context
        });
    }

    // Performance tracking automático
    startPerformanceTracking() {
        // Core Web Vitals
        this.trackWebVitals();

        // Resource timing
        this.trackResourceTiming();

        // Navigation timing
        this.trackNavigationTiming();
    }

    trackWebVitals() {
        // FCP (First Contentful Paint)
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        if (entry.name === 'first-contentful-paint') {
                            this.trackPerformance('fcp', entry.startTime, {
                                entryType: entry.entryType
                            });
                        }
                    });
                });
                observer.observe({ entryTypes: ['paint'] });
            } catch (error) {
                console.warn('Performance Observer não suportado:', error);
            }
        }

        // LCP (Largest Contentful Paint)
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const lastEntry = entries[entries.length - 1];
                    this.trackPerformance('lcp', lastEntry.startTime, {
                        element: lastEntry.element?.tagName
                    });
                });
                observer.observe({ entryTypes: ['largest-contentful-paint'] });
            } catch (error) {
                console.warn('LCP tracking não suportado:', error);
            }
        }

        // CLS (Cumulative Layout Shift)
        if ('PerformanceObserver' in window) {
            try {
                let clsValue = 0;
                const observer = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        if (!entry.hadRecentInput) {
                            clsValue += entry.value;
                        }
                    });
                });
                observer.observe({ entryTypes: ['layout-shift'] });

                // Reportar CLS ao sair da página
                window.addEventListener('beforeunload', () => {
                    this.trackPerformance('cls', clsValue);
                });
            } catch (error) {
                console.warn('CLS tracking não suportado:', error);
            }
        }
    }

    trackResourceTiming() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const resources = performance.getEntriesByType('resource');

                // Agregar por tipo de recurso
                const resourceStats = {};
                resources.forEach(resource => {
                    const type = this.getResourceType(resource.name);
                    if (!resourceStats[type]) {
                        resourceStats[type] = {
                            count: 0,
                            totalDuration: 0,
                            totalSize: 0
                        };
                    }

                    resourceStats[type].count++;
                    resourceStats[type].totalDuration += resource.duration;
                    resourceStats[type].totalSize += resource.transferSize || 0;
                });

                this.trackPerformance('resource_stats', resourceStats);
            }, 1000);
        });
    }

    getResourceType(url) {
        if (url.match(/\.(js)$/)) return 'script';
        if (url.match(/\.(css)$/)) return 'stylesheet';
        if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'image';
        if (url.includes('font')) return 'font';
        return 'other';
    }

    trackNavigationTiming() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const navigation = performance.getEntriesByType('navigation')[0];
                if (navigation) {
                    this.trackPerformance('navigation_timing', {
                        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                        domInteractive: navigation.domInteractive - navigation.navigationStart,
                        firstByte: navigation.responseStart - navigation.requestStart
                    });
                }
            }, 1000);
        });
    }

    // Event listeners automáticos
    setupEventListeners() {
        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.endSession();
            } else {
                this.currentSession = this.initializeSession();
            }
        });

        // Track errors automáticamente
        window.addEventListener('error', (event) => {
            this.trackError(event.error || event, {
                filename: event.filename || 'unknown',
                lineno: event.lineno || 0,
                colno: event.colno || 0,
                severity: 'error'
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.trackError(event.reason || event, {
                type: 'unhandled_promise_rejection',
                severity: 'error'
            });
        });

        // Track viewport changes
        window.addEventListener('resize', () => {
            this.currentSession.viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };
        });
    }

    endSession() {
        this.currentSession.endTime = Date.now();
        this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;

        this.sessions.push({ ...this.currentSession });

        // Manter apenas as sessões mais recentes
        if (this.sessions.length > this.maxSessions) {
            this.sessions = this.sessions.slice(-this.maxSessions);
        }

        this.saveSessions();
    }

    // Analytics e insights
    getPopularManga(limit = 10) {
        const mangaViews = this.events
            .filter(e => e.name === 'manga_view')
            .reduce((acc, event) => {
                const url = event.properties.url;
                const title = event.properties.title;
                acc[url] = {
                    url,
                    title,
                    views: (acc[url]?.views || 0) + 1
                };
                return acc;
            }, {});

        return Object.values(mangaViews)
            .sort((a, b) => b.views - a.views)
            .slice(0, limit);
    }

    getSearchInsights() {
        const searches = this.events.filter(e => e.name === 'search');

        const queryLengths = searches.map(s => s.properties.queryLength);
        const avgQueryLength = queryLengths.reduce((a, b) => a + b, 0) / queryLengths.length || 0;

        const popularQueries = searches
            .reduce((acc, search) => {
                const query = search.properties.query.toLowerCase();
                acc[query] = (acc[query] || 0) + 1;
                return acc;
            }, {});

        return {
            totalSearches: searches.length,
            avgQueryLength: Math.round(avgQueryLength * 100) / 100,
            popularQueries: Object.entries(popularQueries)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([query, count]) => ({ query, count }))
        };
    }

    getPerformanceMetrics() {
        const perfEvents = this.events.filter(e => e.name === 'performance');

        const metrics = {};
        perfEvents.forEach(event => {
            const metric = event.properties.metric;
            if (!metrics[metric]) {
                metrics[metric] = [];
            }
            metrics[metric].push(event.properties.value);
        });

        // Calcular estatísticas
        const stats = {};
        Object.entries(metrics).forEach(([metric, values]) => {
            const sorted = values.sort((a, b) => a - b);
            stats[metric] = {
                count: values.length,
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                median: sorted[Math.floor(sorted.length / 2)],
                p95: sorted[Math.floor(sorted.length * 0.95)]
            };
        });

        return stats;
    }

    getErrorReport() {
        const errors = this.events.filter(e => e.name === 'error');

        const errorsByType = errors.reduce((acc, error) => {
            const message = error.properties.message;
            acc[message] = (acc[message] || 0) + 1;
            return acc;
        }, {});

        return {
            totalErrors: errors.length,
            errorsByType: Object.entries(errorsByType)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([message, count]) => ({ message, count })),
            recentErrors: errors
                .sort((a, b) => b.properties.timestamp - a.properties.timestamp)
                .slice(0, 5)
        };
    }

    getDashboard() {
        return {
            sessions: {
                total: this.sessions.length,
                current: this.currentSession,
                avgDuration: this.getAvgSessionDuration()
            },
            popular: this.getPopularManga(5),
            search: this.getSearchInsights(),
            performance: this.getPerformanceMetrics(),
            errors: this.getErrorReport()
        };
    }

    getAvgSessionDuration() {
        const completedSessions = this.sessions.filter(s => s.duration);
        if (completedSessions.length === 0) return 0;

        const totalDuration = completedSessions.reduce((sum, s) => sum + s.duration, 0);
        return Math.round(totalDuration / completedSessions.length / 1000); // em segundos
    }

    // Persistência
    loadEvents() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        } catch {
            return [];
        }
    }

    saveEvents() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.events));
        } catch (error) {
            console.warn('Não foi possível salvar analytics:', error);
        }
    }

    loadSessions() {
        try {
            return JSON.parse(localStorage.getItem(this.sessionKey) || '[]');
        } catch {
            return [];
        }
    }

    saveSessions() {
        try {
            localStorage.setItem(this.sessionKey, JSON.stringify(this.sessions));
        } catch (error) {
            console.warn('Não foi possível salvar sessões:', error);
        }
    }

    // Utilitários para debug
    exportData() {
        return {
            events: this.events,
            sessions: this.sessions,
            currentSession: this.currentSession,
            exportTime: new Date().toISOString()
        };
    }

    clearData() {
        this.events = [];
        this.sessions = [];
        this.currentSession = this.initializeSession();

        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.sessionKey);

        console.log('Dados de analytics limpos');
    }

    getStats() {
        return {
            totalEvents: this.events.length,
            totalSessions: this.sessions.length,
            currentSessionDuration: Date.now() - this.currentSession.startTime,
            storageUsed: this.getStorageSize()
        };
    }

    getStorageSize() {
        const events = localStorage.getItem(this.storageKey) || '';
        const sessions = localStorage.getItem(this.sessionKey) || '';
        return events.length + sessions.length;
    }
}

// Instância global (apenas no browser)
export const analytics = typeof window !== 'undefined' ? new LocalAnalytics() : null;

// Auto-track page view inicial
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            analytics?.trackPageView('initial');
        });
    } else {
        analytics?.trackPageView('initial');
    }
}