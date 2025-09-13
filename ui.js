import { store } from './store.js';
import { ITEMS_PER_PAGE } from './constants.js';

// Centraliza todos os seletores de DOM para fácil manutenção.
let dom = null;
export function getDOM() {
    if (!dom) {
        dom = {
            subtitle: document.getElementById('subtitle'),
            mainLoader: document.getElementById('main-loader'),
            tabs: document.getElementById('tabs'),
            searchContainer: document.getElementById('search-container'),
            searchInput: document.getElementById('search-input'),
            contentContainer: document.getElementById('content-container'),
            paginationControls: document.getElementById('pagination-controls'),
        };
    }
    return dom;
}

const createCardHTML = (data, isFavorite) => {
    const shortDescription = data.description ? (data.description.length > 110 ? data.description.substring(0, 110) + '...' : data.description) : '';
    const metadataHTML = [
        { icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>`, value: data.author, title: `Autor: ${data.author}` },
        { icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>`, value: data.artist, title: `Artista: ${data.artist}` },
        { icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`, value: data.status },
        { icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h.01a1 1 0 100-2H10zm3 0a1 1 0 000 2h.01a1 1 0 100-2H13z" clip-rule="evenodd" /></svg>`, value: data.chapterCount ? `${data.chapterCount} Capítulos` : null }
    ].filter(m => m.value).map(m => `<span class="flex items-center gap-1 text-xs text-gray-300" title="${m.title || ''}">${m.icon}<span class="truncate">${m.value}</span></span>`).join('');
    const genresHTML = data.genres && data.genres.length > 0 ? `<div class="flex flex-wrap gap-1">${data.genres.slice(0, 3).map(g => `<span class="bg-gray-700 text-blue-300 text-xs font-semibold px-2 py-0.5 rounded-full">${g}</span>`).join('')}</div>` : '';

    return `
        <div class="card-wrapper relative">
            <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="card-container relative flex bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-transform transform hover:-translate-y-1 hover:shadow-2xl">
                <img src="${data.imageUrl}" alt="Capa de ${data.title}" class="card-image" onerror="this.onerror=null;this.src='https://placehold.co/256x384/1f2937/7ca3f5?text=Inválida';">
                <div class="flex flex-col flex-grow p-4 pt-10">
                    <p class="text-sm text-gray-400 flex-grow overflow-hidden">${shortDescription}</p>
                    <div class="mt-auto pt-2 space-y-2">
                        ${genresHTML}
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1">${metadataHTML}</div>
                    </div>
                </div>
                <div class="absolute top-0 left-0 w-full p-2 bg-gradient-to-t from-transparent to-black/60 rounded-t-lg">
                    <h3 class="text-lg font-bold truncate text-white" title="${data.title}">${data.title}</h3>
                </div>
            </a>
            <button class="favorite-btn absolute top-2 right-2 p-1.5 bg-gray-900/50 rounded-full text-white hover:text-red-500 backdrop-blur-sm transition-colors" data-url="${data.url}" title="Favoritar">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                   <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" class="${isFavorite ? 'text-red-500' : 'text-white/80'}" clip-rule="evenodd" />
                </svg>
            </button>
        </div>`;
};

const renderCards = (container, cardDataList, favoritesSet) => {
    if (!cardDataList || cardDataList.length === 0) {
        container.innerHTML = `<div class="col-span-1 md:col-span-2 lg:col-span-3 text-center text-gray-400 p-8"><p>Nenhum item encontrado.</p></div>`;
        return;
    }
    container.innerHTML = cardDataList.map(data => createCardHTML(data, favoritesSet.has(data.url))).join('');
};

const renderPagination = (controlsContainer, totalItems, currentPage) => {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) {
        controlsContainer.innerHTML = '';
        return;
    }
    let buttons = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === currentPage;
        buttons += `<button data-page="${i}" class="pagination-btn px-4 py-2 text-sm font-medium rounded-md ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}">${i}</button>`;
    }
    controlsContainer.innerHTML = buttons;
};

/**
 * Função de renderização principal.
 * Lê o estado atual do 'store' e atualiza o DOM para refleti-lo.
 * Esta é a única função que deve fazer manipulação direta do DOM em massa.
 */
export function renderApp() {
    const state = store.getState();
    const dom = getDOM();

    // Renderiza loader e erros
    dom.mainLoader.classList.toggle('hidden', !state.isLoading);
    if (state.error) {
        dom.contentContainer.innerHTML = `<div class="col-span-full text-center text-red-400 p-8 bg-gray-800 rounded-lg"><p>${state.error}</p></div>`;
        dom.paginationControls.innerHTML = '';
        return;
    }
    
    // Renderiza estado das abas
    dom.tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
    dom.searchContainer.classList.toggle('hidden', state.activeTab !== 'library');

    // Determina qual conteúdo mostrar com base na aba ativa
    let itemsToDisplay = [];
    let totalPaginationItems = 0;

    switch (state.activeTab) {
        case 'home':
            itemsToDisplay = [...state.allManga]
                .sort((a, b) => b.lastUpdated - a.lastUpdated)
                .slice(0, 20);
            break;
        case 'library':
            const filteredLibrary = state.allManga
                .filter(m => m.title.toLowerCase().includes(state.searchQuery.toLowerCase()))
                .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
            totalPaginationItems = filteredLibrary.length;
            itemsToDisplay = filteredLibrary.slice((state.currentPage - 1) * ITEMS_PER_PAGE, state.currentPage * ITEMS_PER_PAGE);
            break;
        case 'favorites':
            itemsToDisplay = state.allManga.filter(m => state.favorites.has(m.url));
            break;
    }

    renderCards(dom.contentContainer, itemsToDisplay, state.favorites);
    renderPagination(dom.paginationControls, totalPaginationItems, state.currentPage);
}
