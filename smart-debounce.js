/**
 * Sistema de debounce inteligente para busca
 */
export class SmartDebounce {
    constructor(func, options = {}) {
        this.func = func;
        this.wait = options.wait || 300;
        this.immediate = options.immediate || false;
        this.maxWait = options.maxWait || 1000;
        this.minLength = options.minLength || 2;

        this.timeout = null;
        this.maxTimeout = null;
        this.lastCall = 0;
        this.lastArgs = null;
        this.callCount = 0;

        // Adaptive timing baseado no comportamento do usuário
        this.adaptiveDelay = this.wait;
        this.typingSpeed = [];
        this.lastKeyTime = 0;
    }

    execute(...args) {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCall;

        // Calcular velocidade de digitação
        if (this.lastKeyTime > 0) {
            const keyInterval = now - this.lastKeyTime;
            this.typingSpeed.push(keyInterval);

            // Manter apenas os últimos 5 intervalos
            if (this.typingSpeed.length > 5) {
                this.typingSpeed.shift();
            }

            // Ajustar delay baseado na velocidade de digitação
            this.adaptiveDelay = this.calculateAdaptiveDelay();
        }

        this.lastKeyTime = now;
        this.lastArgs = args;
        this.callCount++;

        // Verificar comprimento mínimo (para busca)
        if (args[0] && typeof args[0] === 'string' && args[0].length < this.minLength) {
            this.cancel();
            return;
        }

        // Execução imediata se habilitada e tempo suficiente passou
        if (this.immediate && timeSinceLastCall >= this.adaptiveDelay) {
            this.func.apply(this, args);
            this.lastCall = now;
            return;
        }

        // Cancelar timeout anterior
        this.cancel();

        // Configurar novo timeout
        this.timeout = setTimeout(() => {
            this.func.apply(this, args);
            this.lastCall = Date.now();
            this.cleanup();
        }, this.adaptiveDelay);

        // Garantir execução máxima
        if (!this.maxTimeout && this.maxWait > 0) {
            this.maxTimeout = setTimeout(() => {
                if (this.timeout) {
                    clearTimeout(this.timeout);
                    this.func.apply(this, this.lastArgs);
                    this.lastCall = Date.now();
                    this.cleanup();
                }
            }, this.maxWait);
        }
    }

    calculateAdaptiveDelay() {
        if (this.typingSpeed.length === 0) return this.wait;

        const averageSpeed = this.typingSpeed.reduce((a, b) => a + b, 0) / this.typingSpeed.length;

        // Usuário digitando rápido: aumentar delay
        // Usuário digitando devagar: diminuir delay
        if (averageSpeed < 100) { // Digitação muito rápida
            return Math.min(this.wait * 1.5, 500);
        } else if (averageSpeed > 300) { // Digitação lenta
            return Math.max(this.wait * 0.7, 150);
        }

        return this.wait;
    }

    cancel() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        if (this.maxTimeout) {
            clearTimeout(this.maxTimeout);
            this.maxTimeout = null;
        }
    }

    cleanup() {
        this.timeout = null;
        this.maxTimeout = null;
    }

    flush() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.func.apply(this, this.lastArgs);
            this.cleanup();
        }
    }

    getStats() {
        return {
            callCount: this.callCount,
            adaptiveDelay: this.adaptiveDelay,
            averageTypingSpeed: this.typingSpeed.length > 0
                ? this.typingSpeed.reduce((a, b) => a + b, 0) / this.typingSpeed.length
                : 0
        };
    }
}

/**
 * Sistema de autocomplete inteligente
 */
export class SmartAutocomplete {
    constructor(input, dataSource, options = {}) {
        this.input = input;
        this.dataSource = dataSource;
        this.options = {
            maxSuggestions: 8,
            minLength: 2,
            highlightMatches: true,
            showRecentSearches: true,
            debounceTime: 300, // Aumentado para evitar conflitos
            onInput: null, // Callback para coordenar com sistema principal
            ...options
        };

        this.suggestions = [];
        this.selectedIndex = -1;
        this.isVisible = false;
        this.recentSearches = this.loadRecentSearches();
        this.isDestroyed = false;

        this.createDropdown();
        this.setupEventListeners();

        // Debounce inteligente para suggestions (separado do sistema principal)
        this.debouncedGetSuggestions = new SmartDebounce(
            this.getSuggestions.bind(this),
            {
                wait: this.options.debounceTime,
                minLength: this.options.minLength,
                maxWait: 800
            }
        );
    }

    createDropdown() {
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'autocomplete-dropdown absolute top-full left-0 right-0 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg hidden z-50 max-h-64 overflow-y-auto';

        // Inserir após o input
        this.input.parentNode.style.position = 'relative';
        this.input.parentNode.appendChild(this.dropdown);
    }

    setupEventListeners() {
        // Event listener para autocomplete (não interfere com sistema principal)
        this.inputHandler = (e) => {
            if (this.isDestroyed) return;

            const query = e.target.value.trim();

            // Coordenar com sistema principal se callback definido
            if (this.options.onInput) {
                this.options.onInput(query);
            }

            // Gerenciar suggestions
            if (query.length === 0) {
                this.showRecentSearches();
            } else if (query.length >= this.options.minLength) {
                this.debouncedGetSuggestions.execute(query);
            } else {
                this.hide();
            }
        };

        this.input.addEventListener('input', this.inputHandler);
        this.input.addEventListener('keydown', this.handleKeydown.bind(this));
        this.input.addEventListener('focus', this.handleFocus.bind(this));
        this.input.addEventListener('blur', this.handleBlur.bind(this));

        this.dropdown.addEventListener('click', this.handleClick.bind(this));

        // Fechar dropdown ao clicar fora
        this.outsideClickHandler = (e) => {
            if (this.isDestroyed || !this.input.parentNode.contains(e.target)) {
                this.hide();
            }
        };
        document.addEventListener('click', this.outsideClickHandler);
    }

    async getSuggestions(query) {
        if (!query || query.length < this.options.minLength) {
            this.hide();
            return;
        }

        try {
            const suggestions = await this.generateSuggestions(query);
            this.suggestions = suggestions.slice(0, this.options.maxSuggestions);
            this.selectedIndex = -1;
            this.render();
            this.show();
        } catch (error) {
            console.error('Erro ao gerar suggestions:', error);
            this.hide();
        }
    }

    async generateSuggestions(query) {
        const lowerQuery = query.toLowerCase();
        const suggestions = new Set();

        // Buscar em títulos
        this.dataSource
            .filter(item => item.title && item.title.toLowerCase().includes(lowerQuery))
            .slice(0, 4)
            .forEach(item => suggestions.add({
                text: item.title,
                type: 'title',
                data: item
            }));

        // Buscar em autores
        this.dataSource
            .filter(item => item.author && item.author.toLowerCase().includes(lowerQuery))
            .slice(0, 2)
            .forEach(item => suggestions.add({
                text: item.author,
                type: 'author',
                data: item
            }));

        // Buscar em gêneros
        const genres = [...new Set(this.dataSource.flatMap(item => item.genres || []))]
            .filter(genre => genre.toLowerCase().includes(lowerQuery))
            .slice(0, 2);

        genres.forEach(genre => suggestions.add({
            text: genre,
            type: 'genre'
        }));

        return Array.from(suggestions);
    }

    showRecentSearches() {
        if (!this.options.showRecentSearches || this.recentSearches.length === 0) {
            this.hide();
            return;
        }

        this.suggestions = this.recentSearches.map(search => ({
            text: search,
            type: 'recent'
        }));
        this.selectedIndex = -1;
        this.render();
        this.show();
    }

    render() {
        if (this.suggestions.length === 0) {
            this.hide();
            return;
        }

        const html = this.suggestions.map((suggestion, index) => {
            const isSelected = index === this.selectedIndex;
            const icon = this.getTypeIcon(suggestion.type);
            const highlightedText = this.options.highlightMatches
                ? this.highlightMatch(suggestion.text, this.input.value)
                : suggestion.text;

            return `
                <div class="suggestion-item px-4 py-2 cursor-pointer flex items-center space-x-2 hover:bg-neutral-700 ${isSelected ? 'bg-neutral-700' : ''}"
                     data-index="${index}" data-text="${suggestion.text}">
                    <span class="w-4 h-4 flex-shrink-0 text-gray-400">${icon}</span>
                    <span class="flex-grow truncate">${highlightedText}</span>
                    <span class="text-xs text-gray-500 flex-shrink-0">${this.getTypeLabel(suggestion.type)}</span>
                </div>
            `;
        }).join('');

        this.dropdown.innerHTML = html;
    }

    getTypeIcon(type) {
        const icons = {
            title: '📖',
            author: '👤',
            genre: '🏷️',
            recent: '🕒'
        };
        return icons[type] || '🔍';
    }

    getTypeLabel(type) {
        const labels = {
            title: 'título',
            author: 'autor',
            genre: 'gênero',
            recent: 'recente'
        };
        return labels[type] || '';
    }

    highlightMatch(text, query) {
        if (!query) return text;

        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return text.replace(regex, '<mark class="bg-blue-600 text-white px-1 rounded">$1</mark>');
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    handleKeydown(e) {
        if (!this.isVisible) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
                this.render();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.render();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectSuggestion(this.suggestions[this.selectedIndex]);
                }
                break;
            case 'Escape':
                this.hide();
                break;
        }
    }

    handleFocus() {
        if (this.input.value.trim() === '') {
            this.showRecentSearches();
        }
    }

    handleBlur() {
        // Delay para permitir cliques no dropdown
        setTimeout(() => this.hide(), 150);
    }

    handleClick(e) {
        const item = e.target.closest('.suggestion-item');
        if (item) {
            const index = parseInt(item.dataset.index);
            this.selectSuggestion(this.suggestions[index]);
        }
    }

    selectSuggestion(suggestion) {
        this.input.value = suggestion.text;
        this.hide();

        // Adicionar ao histórico
        this.addToRecentSearches(suggestion.text);

        // Trigger evento de mudança
        this.input.dispatchEvent(new Event('input', { bubbles: true }));

        // Callback customizado
        if (this.options.onSelect) {
            this.options.onSelect(suggestion);
        }
    }

    addToRecentSearches(search) {
        if (!search.trim()) return;

        this.recentSearches = this.recentSearches.filter(s => s !== search);
        this.recentSearches.unshift(search);
        this.recentSearches = this.recentSearches.slice(0, 5);

        this.saveRecentSearches();
    }

    loadRecentSearches() {
        try {
            return JSON.parse(localStorage.getItem('gikamura_recent_searches') || '[]');
        } catch {
            return [];
        }
    }

    saveRecentSearches() {
        try {
            localStorage.setItem('gikamura_recent_searches', JSON.stringify(this.recentSearches));
        } catch (error) {
            console.warn('Não foi possível salvar histórico de busca:', error);
        }
    }

    show() {
        this.dropdown.classList.remove('hidden');
        this.isVisible = true;
    }

    hide() {
        this.dropdown.classList.add('hidden');
        this.isVisible = false;
        this.selectedIndex = -1;
    }

    updateDataSource(newDataSource) {
        this.dataSource = newDataSource;
    }

    destroy() {
        this.isDestroyed = true;

        // Cancelar debounce
        if (this.debouncedGetSuggestions) {
            this.debouncedGetSuggestions.cancel();
        }

        // Remover event listeners
        if (this.input && this.inputHandler) {
            this.input.removeEventListener('input', this.inputHandler);
        }
        if (this.outsideClickHandler) {
            document.removeEventListener('click', this.outsideClickHandler);
        }

        // Remover dropdown
        if (this.dropdown && this.dropdown.parentNode) {
            this.dropdown.parentNode.removeChild(this.dropdown);
        }

        // Limpar referências
        this.input = null;
        this.dropdown = null;
        this.suggestions = [];
    }
}