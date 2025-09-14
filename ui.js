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

// --- CARD HORIZONTAL (INFORMAÇÕES NA ESQUERDA / CAPA NA DIREITA) ---
const createCardHTML = (data, isFavorite) => {
    // Ícones para metadados
    const iconBook = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 002 2H4a2 2 0 01-2-2V5zm3 1h6v4H5V6z" clip-rule="evenodd" /></svg>`;
    const iconTag = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a1 1 0 011-1h5a1 1 0 01.707.293l7 7zM6 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>`;

    // Limpa os dados para evitar texto 'null' ou 'undefined'
    const author = data.author || 'N/A';
    const artist = data.artist || 'N/A';
    const chapters = data.chapterCount || 'N/A';
    const status = data.status || 'N/A';
    const type = data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'N/A';
    const description = data.description || 'Sem descrição disponível.';

    return `
    <div class="relative bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-transform transform hover:-translate-y-1 hover:shadow-2xl h-48 flex">
        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="flex flex-grow">
            <div class="flex flex-col flex-grow p-4 text-white overflow-hidden">
                <h3 class="text-base font-bold truncate" title="${data.title}">${data.title}</h3>

                <p class="text-xs text-gray-400 truncate" title="Por: ${author}${author !== artist ? ` & ${artist}` : ''}">
                    Por: ${author}${author !== artist ? ` & ${artist}` : ''}
                </p>

                <p class="text-xs text-gray-300 mt-2 leading-snug line-clamp-3" style="-webkit-box-orient: vertical;" title="${description}">
                    ${description}
                </p>

                <div class="mt-auto pt-2 flex items-end justify-between text-xs">
                    <div class="flex items-center gap-4 text-gray-300">
                        <span class="flex items-center gap-1.5" title="Capítulos">${iconBook} ${chapters}</span>
                        <span class="flex items-center gap-1.5" title="Status">${iconTag} ${status}</span>
                    </div>
                    <span class="bg-blue-600 text-white font-semibold px-2 py-0.5 rounded-md">${type}</span>
                </div>
            </div>

            <div class="w-32 flex-shrink-0">
                <img src="${data.imageUrl}" alt="Capa de ${data.title}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/256x384/1f2937/7ca3f5?text=Inválida';">
            </div>
        </a>

        <button class="favorite-btn absolute top-2 right-2 p-1.5 bg-gray-900/50 rounded-full text-white hover:text-red-500 backdrop-blur-sm transition-colors z-10" data-url="${data.url}" title="Favoritar">
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
