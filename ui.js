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
            notification: document.getElementById('notification'),
            typeFilterContainer: document.getElementById('type-filter-container'),
        };
    }
    return dom;
}

/**
 * Exibe uma notificação na tela por um curto período.
 */
let notificationTimeout;
export function showNotification(message, duration = 4000) {
    const { notification } = getDOM();
    if (!notification) return;
    clearTimeout(notificationTimeout);
    notification.textContent = message;
    notification.classList.remove('translate-y-20', 'opacity-0');
    notificationTimeout = setTimeout(() => {
        notification.classList.add('translate-y-20', 'opacity-0');
    }, duration);
}

// --- FUNÇÃO createCardHTML COM LAYOUT CORRIGIDO E COMPLETO ---
const createCardHTML = (data, isFavorite) => {
    // Aumentamos um pouco o limite da descrição
    const shortDescription = data.description ? (data.description.length > 130 ? data.description.substring(0, 130) + '...' : data.description) : 'Sem descrição disponível.';
    
    // Gera o HTML para cada metadado condicionalmente
    const typeHTML = data.type ? `<span class="bg-gray-700 text-blue-300 text-xs font-semibold px-2.5 py-1 rounded-full">${data.type.charAt(0).toUpperCase() + data.type.slice(1)}</span>` : '';
    const statusHTML = data.status ? `<span class="bg-gray-700 text-gray-300 text-xs font-semibold px-2.5 py-1 rounded-full">${data.status}</span>` : '';
    const authorHTML = data.author ? `<li class="truncate" title="Autor: ${data.author}"><span class="font-semibold text-gray-400">Autor:</span> ${data.author}</li>` : '';
    const artistHTML = data.artist ? `<li class="truncate" title="Artista: ${data.artist}"><span class="font-semibold text-gray-400">Artista:</span> ${data.artist}</li>` : '';
    const chaptersHTML = data.chapterCount ? `<li title="Capítulos"><span class="font-semibold text-gray-400">Capítulos:</span> ${data.chapterCount}</li>` : '';

    return `
        <div class="card-wrapper relative">
            <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="card-container relative flex bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-transform transform hover:-translate-y-1 hover:shadow-2xl">
                
                <img src="${data.imageUrl}" alt="Capa de ${data.title}" class="card-image" onerror="this.onerror=null;this.src='https://placehold.co/256x384/1f2937/7ca3f5?text=Inválida';">

                <div class="flex flex-col flex-grow p-3">
                    <h3 class="text-base font-bold truncate text-white mb-2" title="${data.title}">${data.title}</h3>
                    
                    <p class="text-sm text-gray-400 flex-grow overflow-hidden mb-2">${shortDescription}</p>
                    
                    <div class="mt-auto flex flex-col gap-2 text-xs text-gray-300">
                        <div class="flex items-center gap-2">
                            ${typeHTML}
                            ${statusHTML}
                        </div>
                        
                        <ul class="border-t border-gray-700/50 pt-1.5 space-y-1">
                           ${authorHTML}
                           ${artistHTML}
                           ${chaptersHTML}
                        </ul>
                    </div>
                </div>

            </a>
            <button class="favorite-btn absolute top-2 right-2 p-1.5 bg-gray-900/50 rounded-full text-white hover:text-red-500 backdrop-blur-sm transition-colors z-10" data-url="${data.url}" title="Favoritar">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                   <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" class="${isFavorite ? 'text-red-500' : 'text-white/80'}" clip-rule="evenodd" />
                </svg>
            </button>
        </div>`;
};


// O restante do arquivo (renderCards, renderPagination, renderApp) permanece o mesmo
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

export function renderApp() {
    const state = store.getState();
    const dom = getDOM();

    dom.mainLoader.classList.toggle('hidden', !state.isLoading);
    if (state.error) {
        dom.contentContainer.innerHTML = `
            <div class="col-span-full text-center text-red-400 p-8 bg-gray-800 rounded-lg space-y-4">
                <p>${state.error}</p>
                <button id="reload-page-btn" class="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    Atualizar Página
                </button>
            </div>`;
        dom.paginationControls.innerHTML = '';
        dom.subtitle.textContent = "Ocorreu um erro";
        return;
    }
    
    dom.tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
    const isLibraryActive = state.activeTab === 'library';
    dom.searchContainer.classList.toggle('hidden', !isLibraryActive);
    dom.typeFilterContainer.classList.toggle('hidden', !isLibraryActive);

    if (isLibraryActive) {
        dom.typeFilterContainer.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === state.activeTypeFilter);
        });
    }

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
                .filter(m => {
                    if (state.activeTypeFilter === 'all') return true;
                    return m.type === state.activeTypeFilter;
                })
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
