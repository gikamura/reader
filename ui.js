import { store } from './store.js';
import { ITEMS_PER_PAGE } from './constants.js';

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
            statusFilterContainer: document.getElementById('status-filter-container'),
            sortContainer: document.getElementById('sort-container'),
            libraryControls: document.getElementById('library-controls'),
            updatesContent: document.getElementById('updates-content'),
            updatesList: document.getElementById('updates-list'),
            notificationsEnabledToggle: document.getElementById('notifications-enabled'),
            popupsEnabledToggle: document.getElementById('popups-enabled'),
            updatePopupContainer: document.getElementById('update-popup-container'),
        };
    }
    return dom;
}

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

function createUpdatePopupHTML(updateData) {
    const { manga, newChapters } = updateData;
    const chapterText = newChapters.length > 1 
        ? `${newChapters.length} novos capítulos` 
        : `Novo capítulo: ${newChapters[0].title}`;

    return `
    <a href="${manga.url}" target="_blank" rel="noopener noreferrer" class="notification-popup flex items-center w-80 max-w-sm bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl overflow-hidden cursor-pointer" data-url="${manga.url}">
        <img src="${manga.imageUrl}" alt="Capa" class="w-16 h-24 object-cover flex-shrink-0">
        <div class="p-3 overflow-hidden">
            <h4 class="font-bold text-white truncate">${manga.title}</h4>
            <p class="text-sm text-gray-300">${chapterText}</p>
        </div>
    </a>`;
}

let popupQueue = [];
let isShowingPopup = false;

function processPopupQueue() {
    if (isShowingPopup || popupQueue.length === 0) {
        return;
    }
    isShowingPopup = true;
    const updateData = popupQueue.shift();
    const dom = getDOM();
    const popupHTML = createUpdatePopupHTML(updateData);
    
    const popupNode = document.createElement('div');
    popupNode.innerHTML = popupHTML;
    
    dom.updatePopupContainer.appendChild(popupNode);
    const popupElement = popupNode.querySelector('.notification-popup');
    
    popupElement.classList.add('show');

    setTimeout(() => {
        popupElement.classList.remove('show');
        popupElement.classList.add('hide');
        popupElement.addEventListener('animationend', () => {
            popupNode.remove();
            isShowingPopup = false;
            processPopupQueue();
        });
    }, 6000);
}

export function showUpdatePopup(updateData) {
    const { settings } = store.getState();
    if (!settings.popupsEnabled) return;
    
    popupQueue.push(updateData);
    processPopupQueue();
}

function createUpdateHistoryItemHTML(update) {
    const { manga, newChapters } = update;
    const updateTime = new Date(update.timestamp).toLocaleString('pt-BR');
    const chapterText = newChapters.map(c => c.title).join(', ');

    return `
    <a href="${manga.url}" target="_blank" rel="noopener noreferrer" class="flex items-center p-3 bg-[#050505]/50 rounded-lg hover:bg-neutral-800 transition-colors border border-neutral-800/60">
        <img src="${manga.imageUrl}" alt="Capa" class="w-12 h-16 object-cover rounded-md mr-4 flex-shrink-0">
        <div class="overflow-hidden">
            <p class="font-semibold text-white truncate">${manga.title}</p>
            <p class="text-sm text-gray-400 truncate">Novos capítulos: ${chapterText}</p>
            <p class="text-xs text-gray-500 mt-1">${updateTime}</p>
        </div>
    </a>`;
}

function renderUpdatesTab(state) {
    const dom = getDOM();
    dom.notificationsEnabledToggle.checked = state.settings.notificationsEnabled;
    dom.popupsEnabledToggle.checked = state.settings.popupsEnabled;
    dom.popupsEnabledToggle.disabled = !state.settings.notificationsEnabled;

    if (state.updates.length === 0) {
        dom.updatesList.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhuma atualização recente.</p>`;
    } else {
        dom.updatesList.innerHTML = state.updates.map(createUpdateHistoryItemHTML).join('');
    }
}

const createCardMetadata = (icon, title, value) => {
    return `
    <div class="flex items-center gap-1.5 text-gray-300 truncate" title="${title}: ${value}">
        ${icon}
        <span class="truncate">${value}</span>
    </div>`;
};

const createCardHTML = (data, isFavorite) => {
    const iconUser = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>`;
    const iconPaintBrush = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>`;
    const iconBookOpen = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" /></svg>`;
    
    const author = data.author || 'N/A';
    const artist = data.artist || 'N/A';
    const status = data.status || 'N/A';
    const type = data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'N/A';
    const description = data.description || 'Sem descrição disponível.';
    const chapterCount = data.chapterCount || 'N/A';

    return `
    <div class="relative bg-[#1a1a1a] rounded-lg shadow-lg overflow-hidden transition-transform transform hover:-translate-y-1 hover:shadow-2xl group" style="height: 16rem;">
        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="relative flex flex-grow w-full h-full">
            <div class="w-1/3 flex-shrink-0 bg-[#050505]">
                <img src="${data.imageUrl}" alt="Capa de ${data.title}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/256x384/1f2937/7ca3f5?text=Inválida';">
            </div>
            <div class="flex flex-col flex-grow p-4 text-white overflow-hidden w-2/3">
                <div class="h-10"></div> 
                <div class="relative flex-grow">
                     <p class="text-sm text-gray-400 leading-snug line-clamp-4 flex-grow" style="-webkit-box-orient: vertical;">${description}</p>
                    <div class="absolute inset-0 bg-[#1a1a1a] p-2 text-sm text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-auto pointer-events-none group-hover:pointer-events-auto rounded description-scroll">${description}</div>
                </div>
                <div class="mt-auto pt-3 border-t border-neutral-800 text-xs flex items-center justify-start space-x-4 overflow-hidden">
                    ${createCardMetadata(iconUser, 'Autor', author)}
                    ${createCardMetadata(iconPaintBrush, 'Artista', artist)}
                    ${createCardMetadata(iconBookOpen, 'Capítulos', chapterCount)}
                </div>
            </div>
            <div class="absolute top-0 left-0 right-0 px-4 py-2 bg-gradient-to-b from-black/70 to-transparent z-10 pointer-events-none">
                 <h3 class="text-lg font-bold truncate text-white" title="${data.title}">${data.title}</h3>
            </div>
            <div class="absolute bottom-2 left-2 flex items-center gap-2 z-10">
                 <span class="bg-[#050505]/70 text-white font-semibold px-2 py-1 rounded-md text-xs backdrop-blur-sm" title="Status">${status}</span>
                 <span class="bg-blue-600 text-white font-semibold px-2 py-1 rounded-md text-xs">${type}</span>
            </div>
        </a>
        <button class="favorite-btn absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:text-red-500 backdrop-blur-sm transition-colors z-20" data-url="${data.url}" title="Favoritar">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" class="${isFavorite ? 'text-red-500' : 'text-white/80'}" clip-rule="evenodd" />
            </svg>
        </button>
    </div>`;
};

const renderCards = (container, cardDataList, favoritesSet) => {
    const { activeTab } = store.getState();
    if (!cardDataList || cardDataList.length === 0) {
        let message = activeTab === 'favorites' ? 'Você ainda não adicionou nenhum favorito. Clique no coração ♡ em uma obra para adicioná-la aqui.' : 'Nenhum resultado para a sua busca. Tente outros termos.';
        container.innerHTML = `<div class="col-span-1 md:col-span-2 lg:col-span-3 text-center text-gray-400 p-8"><p>${message}</p></div>`;
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
        buttons += `<button data-page="${i}" class="pagination-btn px-4 py-2 text-sm font-medium rounded-md ${isActive ? 'bg-blue-600 text-white' : 'bg-neutral-700 hover:bg-neutral-600'}">${i}</button>`;
    }
    controlsContainer.innerHTML = buttons;
};

export function renderApp() {
    const state = store.getState();
    const dom = getDOM();

    dom.mainLoader.classList.toggle('hidden', !state.isLoading);
    if (state.error) {
        dom.contentContainer.innerHTML = `<div class="col-span-full text-center text-red-400 p-8 bg-[#1a1a1a] rounded-lg space-y-4"><p>${state.error}</p><button id="reload-page-btn" class="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">Atualizar Página</button></div>`;
        dom.paginationControls.innerHTML = '';
        dom.subtitle.textContent = "Ocorreu um erro";
        return;
    }
    
    dom.tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
    
    const isLibraryActive = state.activeTab === 'library';
    const isUpdatesActive = state.activeTab === 'updates';

    dom.searchContainer.classList.toggle('hidden', !isLibraryActive);
    dom.libraryControls.classList.toggle('hidden', !isLibraryActive);
    
    dom.updatesContent.classList.toggle('hidden', !isUpdatesActive);
    dom.contentContainer.classList.toggle('hidden', isUpdatesActive);
    dom.paginationControls.classList.toggle('hidden', isUpdatesActive);

    if (isLibraryActive) {
        dom.typeFilterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === state.activeTypeFilter));
        dom.statusFilterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === state.activeStatusFilter));
    } else if (isUpdatesActive) {
        renderUpdatesTab(state);
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
            let filteredLibrary = state.allManga
                .filter(m => m.title.toLowerCase().includes(state.searchQuery.toLowerCase()))
                .filter(m => state.activeTypeFilter === 'all' || m.type === state.activeTypeFilter)
                .filter(m => state.activeStatusFilter === 'all' || (m.status || '').toLowerCase() === state.activeStatusFilter);

            filteredLibrary.sort((a, b) => {
                if (state.librarySortOrder === 'latest') {
                    return b.lastUpdated - a.lastUpdated;
                }
                return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
            });
            
            totalPaginationItems = filteredLibrary.length;
            itemsToDisplay = filteredLibrary.slice((state.currentPage - 1) * ITEMS_PER_PAGE, state.currentPage * ITEMS_PER_PAGE);
            break;
        case 'favorites':
            itemsToDisplay = state.allManga.filter(m => state.favorites.has(m.url));
            break;
    }

    if (!isUpdatesActive) {
      renderCards(dom.contentContainer, itemsToDisplay, state.favorites);
      renderPagination(dom.paginationControls, totalPaginationItems, state.currentPage);
    }
}
