/**
 * Motor de Busca Avançado para Gikamura Reader
 * 
 * Features:
 * - Busca Fuzzy (tolerância a erros de digitação)
 * - Ranking de relevância
 * - Busca instantânea
 * - Filtros inline (type:manhwa, status:ongoing)
 * - Histórico persistente com frequência
 * - Busca global (biblioteca + scans)
 */

// ==========================================
// ALGORITMO DE BUSCA FUZZY (Levenshtein)
// ==========================================

/**
 * Calcula a distância de Levenshtein entre duas strings
 * @param {string} a 
 * @param {string} b 
 * @returns {number} Distância (quanto menor, mais similar)
 */
export function levenshteinDistance(a, b) {
    if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
    
    a = a.toLowerCase();
    b = b.toLowerCase();
    
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Otimização: usar apenas duas linhas da matriz
    let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
    let currRow = new Array(b.length + 1);

    for (let i = 1; i <= a.length; i++) {
        currRow[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
                prevRow[j] + 1,      // Deleção
                currRow[j - 1] + 1,  // Inserção
                prevRow[j - 1] + cost // Substituição
            );
        }
        [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[b.length];
}

/**
 * Calcula similaridade entre 0 e 1
 * @param {string} a 
 * @param {string} b 
 * @returns {number} Similaridade (1 = idêntico, 0 = totalmente diferente)
 */
export function similarity(a, b) {
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
}

// ==========================================
// PARSER DE FILTROS INLINE
// ==========================================

/**
 * Extrai filtros inline de uma query
 * Exemplos:
 *   "type:manhwa Solo Leveling" → { filters: { type: 'manhwa' }, query: 'Solo Leveling' }
 *   "status:ongoing action" → { filters: { status: 'ongoing' }, query: 'action' }
 */
export function parseQueryFilters(rawQuery) {
    const filters = {};
    let query = rawQuery;
    
    // Padrões de filtros suportados
    const filterPatterns = [
        { key: 'type', pattern: /type:(\w+)/gi, values: ['manga', 'manhwa', 'manhua', 'all'] },
        { key: 'status', pattern: /status:(\w+)/gi, values: ['ongoing', 'completed', 'hiatus', 'all'] },
        { key: 'author', pattern: /author:"([^"]+)"|author:(\S+)/gi },
        { key: 'genre', pattern: /genre:"([^"]+)"|genre:(\S+)/gi }
    ];
    
    for (const { key, pattern, values } of filterPatterns) {
        const matches = [...rawQuery.matchAll(pattern)];
        for (const match of matches) {
            const value = (match[1] || match[2] || '').toLowerCase();
            
            // Validar valor se houver lista de valores permitidos
            if (!values || values.includes(value)) {
                filters[key] = value;
            }
            
            // Remover filtro da query
            query = query.replace(match[0], '').trim();
        }
    }
    
    // Limpar espaços extras
    query = query.replace(/\s+/g, ' ').trim();
    
    return { filters, query };
}

// ==========================================
// SISTEMA DE RANKING DE RELEVÂNCIA
// ==========================================

/**
 * Calcula score de relevância para um item
 * @param {Object} item - Item a ser avaliado (manga/manhwa)
 * @param {string} query - Query de busca
 * @param {Object} options - Opções de configuração
 * @returns {Object} { score, matches }
 */
export function calculateRelevanceScore(item, query, options = {}) {
    const {
        fuzzyThreshold = 0.6,  // Mínimo de similaridade para fuzzy match
        enableFuzzy = true
    } = options;
    
    if (!query || !item) return { score: 0, matches: [] };
    
    const lowerQuery = query.toLowerCase();
    const matches = [];
    let score = 0;
    
    // 1. Match no título (mais importante)
    if (item.title) {
        const lowerTitle = item.title.toLowerCase();
        
        // Match exato no início do título (100 pontos)
        if (lowerTitle.startsWith(lowerQuery)) {
            score += 100;
            matches.push({ field: 'title', type: 'prefix', value: item.title });
        }
        // Match exato em qualquer lugar (80 pontos)
        else if (lowerTitle.includes(lowerQuery)) {
            score += 80;
            matches.push({ field: 'title', type: 'contains', value: item.title });
        }
        // Match por palavra (70 pontos)
        else if (lowerTitle.split(/\s+/).some(word => word.startsWith(lowerQuery))) {
            score += 70;
            matches.push({ field: 'title', type: 'word', value: item.title });
        }
        // Fuzzy match no título (60 pontos * similaridade)
        else if (enableFuzzy) {
            const titleSimilarity = similarity(lowerQuery, lowerTitle);
            // Também verificar palavras individuais
            const words = lowerTitle.split(/\s+/);
            const bestWordSimilarity = Math.max(...words.map(w => similarity(lowerQuery, w)));
            const bestSim = Math.max(titleSimilarity, bestWordSimilarity);
            
            if (bestSim >= fuzzyThreshold) {
                score += Math.round(60 * bestSim);
                matches.push({ field: 'title', type: 'fuzzy', value: item.title, similarity: bestSim });
            }
        }
    }
    
    // 2. Match no autor (50 pontos)
    if (item.author) {
        const lowerAuthor = item.author.toLowerCase();
        if (lowerAuthor.includes(lowerQuery)) {
            score += 50;
            matches.push({ field: 'author', type: 'contains', value: item.author });
        } else if (enableFuzzy && similarity(lowerQuery, lowerAuthor) >= fuzzyThreshold) {
            const sim = similarity(lowerQuery, lowerAuthor);
            score += Math.round(40 * sim);
            matches.push({ field: 'author', type: 'fuzzy', value: item.author, similarity: sim });
        }
    }
    
    // 3. Match em gêneros (30 pontos)
    if (item.genres && Array.isArray(item.genres)) {
        for (const genre of item.genres) {
            const lowerGenre = genre.toLowerCase();
            if (lowerGenre.includes(lowerQuery) || lowerQuery.includes(lowerGenre)) {
                score += 30;
                matches.push({ field: 'genre', type: 'contains', value: genre });
                break; // Só conta uma vez
            }
        }
    }
    
    // 4. Match na descrição (20 pontos)
    if (item.description) {
        const lowerDesc = item.description.toLowerCase();
        if (lowerDesc.includes(lowerQuery)) {
            score += 20;
            matches.push({ field: 'description', type: 'contains' });
        }
    }
    
    // 5. Boost para favoritos (10 pontos extras)
    if (item.isFavorite) {
        score += 10;
    }
    
    return { score, matches };
}

// ==========================================
// MOTOR DE BUSCA PRINCIPAL
// ==========================================

export class SearchEngine {
    constructor(options = {}) {
        this.options = {
            maxResults: 50,
            fuzzyEnabled: true,
            fuzzyThreshold: 0.6,
            instantSearchMinLength: 3,
            historyMaxItems: 20,
            historyKey: 'gikamura_search_history',
            ...options
        };
        
        this.dataSources = new Map(); // Múltiplas fontes de dados
        this.searchHistory = this.loadHistory();
        this.lastQuery = '';
        this.lastResults = [];
    }
    
    /**
     * Registra uma fonte de dados
     * @param {string} name - Nome da fonte (ex: 'library', 'scans')
     * @param {Function} getter - Função que retorna os dados
     */
    registerDataSource(name, getter) {
        this.dataSources.set(name, getter);
    }
    
    /**
     * Atualiza uma fonte de dados
     */
    updateDataSource(name, data) {
        this.dataSources.set(name, () => data);
    }
    
    /**
     * Busca principal com todas as features
     * @param {string} rawQuery - Query do usuário
     * @param {Object} options - Opções de busca
     * @returns {Object} { results, filters, originalQuery, processedQuery }
     */
    search(rawQuery, options = {}) {
        const {
            sources = [...this.dataSources.keys()], // Buscar em todas as fontes por padrão
            limit = this.options.maxResults,
            includeFilters = true
        } = options;
        
        if (!rawQuery || rawQuery.trim().length === 0) {
            return { results: [], filters: {}, originalQuery: '', processedQuery: '' };
        }
        
        // 1. Extrair filtros inline
        const { filters, query } = includeFilters 
            ? parseQueryFilters(rawQuery) 
            : { filters: {}, query: rawQuery };
        
        // 2. Coletar dados de todas as fontes
        let allItems = [];
        for (const sourceName of sources) {
            const getter = this.dataSources.get(sourceName);
            if (getter) {
                const items = typeof getter === 'function' ? getter() : getter;
                if (Array.isArray(items)) {
                    allItems = allItems.concat(items.map(item => ({ ...item, _source: sourceName })));
                }
            }
        }
        
        // 3. Aplicar filtros
        let filteredItems = this.applyFilters(allItems, filters);
        
        // 4. Calcular relevância e ordenar
        const scoredItems = filteredItems
            .map(item => {
                const { score, matches } = calculateRelevanceScore(item, query, {
                    fuzzyThreshold: this.options.fuzzyThreshold,
                    enableFuzzy: this.options.fuzzyEnabled
                });
                return { ...item, _score: score, _matches: matches };
            })
            .filter(item => item._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, limit);
        
        // 5. Cachear resultado
        this.lastQuery = rawQuery;
        this.lastResults = scoredItems;
        
        return {
            results: scoredItems,
            filters,
            originalQuery: rawQuery,
            processedQuery: query,
            totalBeforeFilter: allItems.length,
            totalAfterFilter: filteredItems.length
        };
    }
    
    /**
     * Aplica filtros aos itens
     */
    applyFilters(items, filters) {
        if (!filters || Object.keys(filters).length === 0) {
            return items;
        }
        
        return items.filter(item => {
            // Filtro por tipo
            if (filters.type && filters.type !== 'all') {
                const itemType = (item.type || '').toLowerCase();
                if (itemType !== filters.type) return false;
            }
            
            // Filtro por status
            if (filters.status && filters.status !== 'all') {
                const itemStatus = (item.status || '').toLowerCase();
                const normalizedStatus = this.normalizeStatus(itemStatus);
                if (normalizedStatus !== filters.status) return false;
            }
            
            // Filtro por autor
            if (filters.author) {
                const itemAuthor = (item.author || '').toLowerCase();
                if (!itemAuthor.includes(filters.author)) return false;
            }
            
            // Filtro por gênero
            if (filters.genre) {
                const hasGenre = (item.genres || []).some(g => 
                    g.toLowerCase().includes(filters.genre)
                );
                if (!hasGenre) return false;
            }
            
            return true;
        });
    }
    
    /**
     * Normaliza status para comparação
     */
    normalizeStatus(status) {
        const statusMap = {
            'ongoing': 'ongoing',
            'em andamento': 'ongoing',
            'publishing': 'ongoing',
            'completed': 'completed',
            'completo': 'completed',
            'finished': 'completed',
            'hiatus': 'hiatus',
            'pausado': 'hiatus',
            'on hiatus': 'hiatus'
        };
        return statusMap[status] || status;
    }
    
    /**
     * Busca instantânea (sem debounce para queries longas)
     */
    shouldSearchInstantly(query) {
        return query.length >= this.options.instantSearchMinLength;
    }
    
    // ==========================================
    // HISTÓRICO DE BUSCAS
    // ==========================================
    
    loadHistory() {
        try {
            const data = localStorage.getItem(this.options.historyKey);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }
    
    saveHistory() {
        try {
            localStorage.setItem(this.options.historyKey, JSON.stringify(this.searchHistory));
        } catch (e) {
            console.warn('Erro ao salvar histórico de busca:', e);
        }
    }
    
    /**
     * Adiciona uma busca ao histórico
     * @param {string} query 
     * @param {number} resultsCount 
     */
    addToHistory(query, resultsCount = 0) {
        if (!query || query.trim().length < 2) return;
        
        const normalizedQuery = query.trim().toLowerCase();
        
        // Encontrar entrada existente ou criar nova
        const existingIndex = this.searchHistory.findIndex(
            h => h.query.toLowerCase() === normalizedQuery
        );
        
        if (existingIndex >= 0) {
            // Atualizar frequência e mover para o topo
            const existing = this.searchHistory.splice(existingIndex, 1)[0];
            existing.frequency = (existing.frequency || 1) + 1;
            existing.lastUsed = Date.now();
            existing.resultsCount = resultsCount;
            this.searchHistory.unshift(existing);
        } else {
            // Adicionar nova entrada
            this.searchHistory.unshift({
                query: query.trim(),
                frequency: 1,
                lastUsed: Date.now(),
                resultsCount
            });
        }
        
        // Limitar tamanho
        this.searchHistory = this.searchHistory.slice(0, this.options.historyMaxItems);
        
        this.saveHistory();
    }
    
    /**
     * Retorna sugestões baseadas no histórico
     * @param {string} prefix - Prefixo para filtrar
     * @param {number} limit - Máximo de resultados
     */
    getHistorySuggestions(prefix = '', limit = 5) {
        let suggestions = [...this.searchHistory];
        
        // Filtrar por prefixo se fornecido
        if (prefix) {
            const lowerPrefix = prefix.toLowerCase();
            suggestions = suggestions.filter(h => 
                h.query.toLowerCase().startsWith(lowerPrefix) ||
                h.query.toLowerCase().includes(lowerPrefix)
            );
        }
        
        // Ordenar por frequência e recência
        suggestions.sort((a, b) => {
            // Peso: frequência * 2 + recência normalizada
            const scoreA = (a.frequency || 1) * 2 + (a.lastUsed || 0) / Date.now();
            const scoreB = (b.frequency || 1) * 2 + (b.lastUsed || 0) / Date.now();
            return scoreB - scoreA;
        });
        
        return suggestions.slice(0, limit);
    }
    
    /**
     * Remove uma entrada do histórico
     */
    removeFromHistory(query) {
        this.searchHistory = this.searchHistory.filter(
            h => h.query.toLowerCase() !== query.toLowerCase()
        );
        this.saveHistory();
    }
    
    /**
     * Limpa todo o histórico
     */
    clearHistory() {
        this.searchHistory = [];
        this.saveHistory();
    }
    
    // ==========================================
    // SUGESTÕES DE AUTOCOMPLETE
    // ==========================================
    
    /**
     * Gera sugestões de autocomplete
     * @param {string} query 
     * @param {Object} options 
     */
    getSuggestions(query, options = {}) {
        const { limit = 8, includeHistory = true, includeResults = true } = options;
        
        const suggestions = [];
        
        // 1. Sugestões do histórico
        if (includeHistory && query.length >= 1) {
            const historySuggestions = this.getHistorySuggestions(query, 3);
            historySuggestions.forEach(h => {
                suggestions.push({
                    text: h.query,
                    type: 'history',
                    frequency: h.frequency,
                    icon: '🕒'
                });
            });
        }
        
        // 2. Sugestões de resultados
        if (includeResults && query.length >= 2) {
            const searchResults = this.search(query, { limit: 5 });
            
            // Títulos
            const seenTitles = new Set(suggestions.map(s => s.text.toLowerCase()));
            searchResults.results.forEach(item => {
                if (!seenTitles.has(item.title.toLowerCase())) {
                    suggestions.push({
                        text: item.title,
                        type: 'title',
                        data: item,
                        score: item._score,
                        icon: '📖'
                    });
                    seenTitles.add(item.title.toLowerCase());
                }
            });
            
            // Autores únicos
            const authors = [...new Set(searchResults.results.map(r => r.author).filter(Boolean))];
            authors.slice(0, 2).forEach(author => {
                if (!seenTitles.has(author.toLowerCase())) {
                    suggestions.push({
                        text: author,
                        type: 'author',
                        icon: '👤'
                    });
                }
            });
        }
        
        // 3. Sugestões de filtros
        if (query.includes(':') || query.endsWith('type') || query.endsWith('status')) {
            const filterSuggestions = [
                { text: 'type:manga', type: 'filter', icon: '🇯🇵' },
                { text: 'type:manhwa', type: 'filter', icon: '🇰🇷' },
                { text: 'type:manhua', type: 'filter', icon: '🇨🇳' },
                { text: 'status:ongoing', type: 'filter', icon: '▶️' },
                { text: 'status:completed', type: 'filter', icon: '✅' }
            ];
            
            const lowerQuery = query.toLowerCase();
            filterSuggestions
                .filter(s => s.text.includes(lowerQuery) || lowerQuery.includes(s.text.split(':')[0]))
                .forEach(s => suggestions.push(s));
        }
        
        return suggestions.slice(0, limit);
    }
}

// ==========================================
// ATALHOS DE TECLADO
// ==========================================

export class KeyboardShortcuts {
    constructor(options = {}) {
        this.options = {
            focusSearchKey: '/',
            focusSearchAlt: 'k', // Ctrl+K
            clearKey: 'Escape',
            ...options
        };
        
        this.handlers = new Map();
        this.isEnabled = true;
        
        this.setupGlobalListeners();
    }
    
    setupGlobalListeners() {
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }
    
    handleKeydown(e) {
        if (!this.isEnabled) return;
        
        // Ignorar se estiver em input (exceto para Escape)
        const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
        
        // "/" para focar busca (fora de inputs)
        if (e.key === this.options.focusSearchKey && !isInInput) {
            e.preventDefault();
            this.emit('focusSearch');
            return;
        }
        
        // Ctrl+K / Cmd+K para focar busca (em qualquer lugar)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === this.options.focusSearchAlt) {
            e.preventDefault();
            this.emit('focusSearch');
            return;
        }
        
        // Escape para limpar/fechar
        if (e.key === this.options.clearKey) {
            if (isInInput && e.target.value) {
                // Se está no input com texto, limpar
                this.emit('clearSearch');
            } else if (isInInput) {
                // Se está no input vazio, blur
                e.target.blur();
                this.emit('blurSearch');
            }
            return;
        }
    }
    
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event).push(handler);
    }
    
    off(event, handler) {
        if (this.handlers.has(event)) {
            const handlers = this.handlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.handlers.has(event)) {
            this.handlers.get(event).forEach(handler => handler(data));
        }
    }
    
    enable() {
        this.isEnabled = true;
    }
    
    disable() {
        this.isEnabled = false;
    }
    
    destroy() {
        document.removeEventListener('keydown', this.handleKeydown.bind(this));
        this.handlers.clear();
    }
}

// ==========================================
// INSTÂNCIA GLOBAL
// ==========================================

export const searchEngine = new SearchEngine();
export const keyboardShortcuts = new KeyboardShortcuts();

// Exportar funções utilitárias
export default {
    SearchEngine,
    KeyboardShortcuts,
    searchEngine,
    keyboardShortcuts,
    levenshteinDistance,
    similarity,
    parseQueryFilters,
    calculateRelevanceScore
};
