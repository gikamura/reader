import { store } from './store.js';
import { ITEMS_PER_PAGE } from './constants.js';

// Sistema de fallback inteligente para imagens
window.handleImageError = function(img, originalUrl) {
    // Se já tentou o proxy, vai para placeholder final
    if (img.dataset.proxyAttempted === 'true') {
        img.onerror = null;

        // Detectar tamanho da imagem para placeholder adequado
        const width = img.classList.contains('w-12') ? 48 : 256;
        const height = img.classList.contains('h-16') ? 64 : 384;

        img.src = `https://placehold.co/${width}x${height}/1f2937/ef4444?text=Indisponivel`;
        console.log(`❌ Imagem falhou após proxy: ${originalUrl}`);
        return;
    }

    // Marcar que vai tentar o proxy
    img.dataset.proxyAttempted = 'true';

    // Tentar com proxy wsrv.nl (suporta MyAnimeList e outros CDNs bloqueados)
    // Detectar tamanho para otimização
    const width = img.classList.contains('w-12') ? 48 : 256;
    const height = img.classList.contains('h-16') ? 64 : 384;

    const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&h=${height}&fit=cover&output=webp`;

    console.log(`🔄 Tentando proxy wsrv.nl para: ${originalUrl}`);
    img.src = proxiedUrl;
};

// Sistema de loading states e feedback visual
class LoadingStateManager {
    constructor() {
        this.activeStates = new Set();
        this.feedbackQueue = [];
    }

    show(stateId, message = 'Carregando...', options = {}) {
        this.activeStates.add(stateId);

        const loader = document.getElementById('main-loader');
        if (loader) {
            const subtitle = document.getElementById('subtitle');
            if (subtitle) {
                subtitle.textContent = message;
                subtitle.setAttribute('aria-live', 'polite');
            }

            if (options.showProgress && options.total) {
                this.showProgressBar(stateId, 0, options.total);
            }
        }

        // Debug
        if (window.GIKAMURA_DEBUG) {
            console.log(`[LoadingState] Showing: ${stateId} - ${message}`);
        }
    }

    hide(stateId) {
        this.activeStates.delete(stateId);

        if (this.activeStates.size === 0) {
            const loader = document.getElementById('main-loader');
            if (loader && !loader.classList.contains('hidden')) {
                loader.classList.add('hidden');
            }
        }

        // Debug
        if (window.GIKAMURA_DEBUG) {
            console.log(`[LoadingState] Hiding: ${stateId}`);
        }
    }

    updateProgress(stateId, current, total, message) {
        const progressBar = document.querySelector(`[data-progress-id="${stateId}"]`);
        if (progressBar) {
            const percentage = Math.round((current / total) * 100);
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);

            const subtitle = document.getElementById('subtitle');
            if (subtitle && message) {
                subtitle.textContent = `${message} (${percentage}%)`;
            }
        }
    }

    showProgressBar(stateId, current, total) {
        const loader = document.getElementById('main-loader');
        if (!loader) return;

        let progressContainer = loader.querySelector('.progress-container');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.className = 'progress-container mt-4 w-64';

            const progressBg = document.createElement('div');
            progressBg.className = 'w-full bg-neutral-700 rounded-full h-2';

            const progressBar = document.createElement('div');
            progressBar.className = 'bg-blue-600 h-2 rounded-full transition-all duration-300';
            progressBar.setAttribute('data-progress-id', stateId);
            progressBar.setAttribute('role', 'progressbar');
            progressBar.setAttribute('aria-valuemin', '0');
            progressBar.setAttribute('aria-valuemax', '100');
            progressBar.setAttribute('aria-valuenow', '0');

            progressBg.appendChild(progressBar);
            progressContainer.appendChild(progressBg);
            loader.appendChild(progressContainer);
        }

        this.updateProgress(stateId, current, total);
    }

    showFeedback(message, type = 'info', duration = 3000) {
        const feedback = document.createElement('div');
        feedback.className = `feedback-toast fixed bottom-4 left-4 p-3 rounded-lg shadow-lg z-50 transform translate-y-full opacity-0 transition-all duration-300`;

        const bgColor = type === 'success' ? 'bg-green-600' :
                       type === 'error' ? 'bg-red-600' :
                       type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600';

        feedback.classList.add(bgColor, 'text-white');
        feedback.textContent = message;
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');

        document.body.appendChild(feedback);

        // Animação de entrada
        setTimeout(() => {
            feedback.classList.remove('translate-y-full', 'opacity-0');
        }, 100);

        // Remover após duração
        setTimeout(() => {
            feedback.classList.add('translate-y-full', 'opacity-0');
            setTimeout(() => feedback.remove(), 300);
        }, duration);
    }
}

export const loadingManager = new LoadingStateManager();

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
            updatesBadge: document.getElementById('updates-badge'),
            scansContent: document.getElementById('scans-content'), // Adicionado
            notificationsEnabledToggle: document.getElementById('notifications-enabled'),
            popupsEnabledToggle: document.getElementById('popups-enabled'),
            updatePopupContainer: document.getElementById('update-popup-container'),
            markAllAsReadBtn: document.getElementById('mark-all-as-read-btn'),
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

let popupQueue = [];
let isShowingPopup = false;

function processPopupQueue() {
    if (isShowingPopup || popupQueue.length === 0) return;
    isShowingPopup = true;
    const popupHTML = popupQueue.shift();
    const dom = getDOM();
    
    const popupNode = document.createElement('div');
    popupNode.innerHTML = popupHTML;
    
    dom.updatePopupContainer.appendChild(popupNode);
    const popupElement = popupNode.querySelector('.notification-popup');
    
    popupElement.classList.add('show');

    popupElement.addEventListener('click', () => removePopup(popupElement, popupNode), { once: true });
    setTimeout(() => removePopup(popupElement, popupNode), 6000);
}

function removePopup(popupElement, popupNode) {
    if (!popupElement || !popupNode.parentNode) return;
    popupElement.classList.remove('show');
    popupElement.classList.add('hide');
    popupElement.addEventListener('animationend', () => {
        popupNode.remove();
        isShowingPopup = false;
        processPopupQueue();
    }, { once: true });
}

// Pop-up consolidado
function createGroupedPopupHTML(count, updates) {
    const message = count === 1
        ? `Novo capítulo em <strong>${updates[0].manga.title}</strong>.`
        : `${count} obras foram atualizadas.`;
     return `
    <a href="#" data-tab-target="updates" class="notification-popup notification-grouped flex items-center w-80 max-w-sm bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl overflow-hidden cursor-pointer">
        <div class="p-4 overflow-hidden">
            <h4 class="font-bold text-white">Novas Atualizações</h4>
            <p class="text-sm text-gray-300">${message} Clique para ver.</p>
        </div>
    </a>`;
}

export function showConsolidatedUpdatePopup(updates) {
    const { settings } = store.getState();
    if (!settings.popupsEnabled || updates.length === 0) return;

    popupQueue.push(createGroupedPopupHTML(updates.length, updates));
    processPopupQueue();
}

function createUpdateHistoryItemHTML(update) {
    const { manga, newChapters, read } = update;
    const updateTime = new Date(update.timestamp).toLocaleString('pt-BR');
    const chapterText = newChapters.map(c => c.title).join(', ');
    const unreadClass = read === false ? 'bg-blue-900/40 border-blue-700/60' : 'bg-[#050505]/50 border-neutral-800/60';
    const escapedTitle = manga.title ? manga.title.replace(/"/g, '&quot;') : '';

    return `
    <a href="${manga.url}" target="_blank" rel="noopener noreferrer" class="flex items-center p-3 rounded-lg hover:bg-neutral-800 transition-colors border ${unreadClass}">
        <img src="${manga.imageUrl}" alt="Capa de ${escapedTitle}" class="w-12 h-16 object-cover rounded-md mr-4 flex-shrink-0" loading="lazy" onerror="handleImageError(this, '${manga.imageUrl.replace(/'/g, "\\'")}')">
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
    dom.popupsEnabledToggle.closest('label').classList.toggle('disabled', dom.popupsEnabledToggle.disabled);
    
    dom.markAllAsReadBtn.classList.toggle('hidden', state.unreadUpdates === 0);

    if (state.updates.length === 0) {
        dom.updatesList.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhuma atualização recente.</p>`;
    } else {
        dom.updatesList.innerHTML = state.updates.map(createUpdateHistoryItemHTML).join('');
    }
}

const createCardMetadata = (icon, title, value) => `
    <div class="flex items-center gap-1.5 text-gray-300 truncate" title="${title}: ${value}">
        ${icon}
        <span class="truncate">${value}</span>
    </div>`;

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
    const escapedTitle = data.title ? data.title.replace(/"/g, '&quot;') : 'N/A';

    return `
    <div class="relative bg-[#1a1a1a] rounded-lg shadow-lg overflow-hidden transition-transform transform hover:-translate-y-1 hover:shadow-2xl group" style="height: 16rem;">
        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="relative flex flex-grow w-full h-full">
            <div class="w-1/3 flex-shrink-0 bg-[#050505]">
                <img src="${data.imageUrl}" alt="Capa de ${escapedTitle}" class="w-full h-full object-cover" loading="lazy" onerror="handleImageError(this, '${data.imageUrl.replace(/'/g, "\\'")}')">
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
                 <h3 class="text-lg font-bold truncate text-white" title="${escapedTitle}">${data.title}</h3>
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
        let message = activeTab === 'favorites' ? 'Você ainda não adicionou nenhum favorito.' : 'Nenhum resultado encontrado.';
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

    const getPaginationItems = (currentPage, totalPages) => {
        const delta = 2; // Páginas a mostrar ao redor da atual
        const left = currentPage - delta;
        const right = currentPage + delta;
        const range = [];
        const rangeWithDots = [];
        let l;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= left && i <= right)) {
                range.push(i);
            }
        }

        for (let i of range) {
            if (l) {
                if (i - l === 2) {
                    rangeWithDots.push(l + 1);
                } else if (i - l !== 1) {
                    rangeWithDots.push('...');
                }
            }
            rangeWithDots.push(i);
            l = i;
        }

        return rangeWithDots;
    };

    const paginationItems = getPaginationItems(currentPage, totalPages);
    
    const buttonsHTML = paginationItems.map(item => {
        if (item === '...') {
            return `<span class="px-4 py-2 text-sm font-medium text-gray-500">...</span>`;
        }

        const isActive = item === currentPage;
        return `<button data-page="${item}" class="pagination-btn px-4 py-2 text-sm font-medium rounded-md ${isActive ? 'bg-blue-600 text-white' : 'bg-neutral-700 hover:bg-neutral-600'}">${item}</button>`;
    }).join('');

    controlsContainer.innerHTML = buttonsHTML;
};

// NOVO: Função para criar o card de uma scan
const createScanCardHTML = (scan) => {
    const { name, icon_url, description, total_works } = scan.scan_info;
    return `
    <div class="scan-card cursor-pointer bg-[#1a1a1a] rounded-lg shadow-lg overflow-hidden transition-transform transform hover:-translate-y-1 hover:shadow-2xl flex flex-col p-4 border border-neutral-800/60" data-url="${scan.url}">
        <div class="flex items-center mb-4">
            <img src="${icon_url}" alt="Ícone de ${name}" class="w-16 h-16 object-cover rounded-full mr-4 border-2 border-neutral-700">
            <div>
                <h3 class="text-xl font-bold text-white">${name}</h3>
                <p class="text-sm text-gray-400">${total_works || 'N/A'} obras</p>
            </div>
        </div>
        <p class="text-gray-300 text-sm flex-grow">${description}</p>
    </div>
    `;
};

// NOVO: Função para renderizar a lista de scans
function renderScansList(state) {
    const dom = getDOM();
    dom.scansContent.innerHTML = `
        <h2 class="text-2xl font-bold text-white mb-4">Explorar Scans</h2>
        <div id="scans-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${state.scansList.map(scan => createScanCardHTML(scan)).join('')}
        </div>
    `;
}

// NOVO: Lógica aprimorada para renderizar as obras de uma scan
function renderScanWorks(state) {
    const dom = getDOM();
    const { name, description } = state.selectedScan.scan_info;

    // Prepara o layout inicial com cabeçalho
    dom.scansContent.innerHTML = `
        <div class="mb-6">
            <button id="back-to-scans-btn" class="text-blue-400 hover:text-blue-300 mb-4">&larr; Voltar para a lista de Scans</button>
            <h2 class="text-3xl font-bold text-white">${name}</h2>
            <p class="text-gray-400 mt-1">${description}</p>
        </div>
        <div id="scan-works-grid" class="grid grid-cols-1 md:col-span-2 lg:col-span-3 gap-6"></div>
        <div id="scan-pagination-controls" class="flex justify-center items-center mt-8 space-x-2"></div>
    `;

    const grid = document.getElementById('scan-works-grid');
    const paginationContainer = document.getElementById('scan-pagination-controls');

    if (state.isLoadingScans && state.scanWorks.length === 0) {
        grid.innerHTML = `<div class="col-span-full flex justify-center items-center py-16"><div class="loader"></div><p class="ml-4">Carregando obras...</p></div>`;
        return;
    }

    if (state.scanWorks.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-8">Nenhuma obra encontrada para esta scan.</p>`;
        return;
    }

    // Lógica de paginação
    const totalItems = state.scanWorks.length;
    const itemsToDisplay = state.scanWorks.slice(
        (state.scanWorksCurrentPage - 1) * ITEMS_PER_PAGE,
        state.scanWorksCurrentPage * ITEMS_PER_PAGE
    );

    grid.innerHTML = itemsToDisplay.map(work => createCardHTML(work, state.favorites.has(work.url))).join('');
    renderPagination(paginationContainer, totalItems, state.scanWorksCurrentPage);
}

export function renderApp() {
    const state = store.getState();
    const dom = getDOM();

    dom.mainLoader.classList.toggle('hidden', !state.isLoading);
    if (state.error) {
        dom.contentContainer.innerHTML = `<div class="col-span-full text-center text-red-400 p-8 bg-[#1a1a1a] rounded-lg space-y-4"><p>${state.error}</p><button id="reload-page-btn" class="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">Atualizar Página</button></div>`;
        return;
    }
    
    dom.tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
    
    if (state.unreadUpdates > 0) {
        dom.updatesBadge.textContent = state.unreadUpdates > 9 ? '9+' : state.unreadUpdates;
        dom.updatesBadge.classList.remove('hidden');
    } else {
        dom.updatesBadge.classList.add('hidden');
    }

    const isLibraryActive = state.activeTab === 'library';
    const isUpdatesActive = state.activeTab === 'updates';
    const isScansActive = state.activeTab === 'scans'; // NOVO

    dom.searchContainer.classList.toggle('hidden', !isLibraryActive);
    dom.libraryControls.classList.toggle('hidden', !isLibraryActive);
    dom.updatesContent.classList.toggle('hidden', !isUpdatesActive);
    dom.scansContent.classList.toggle('hidden', !isScansActive); // NOVO
    dom.contentContainer.classList.toggle('hidden', isUpdatesActive || isScansActive); // MODIFICADO
    dom.paginationControls.classList.toggle('hidden', isUpdatesActive || isScansActive); // MODIFICADO

    if (isLibraryActive) {
        dom.typeFilterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === state.activeTypeFilter));
        dom.statusFilterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === state.activeStatusFilter));
    } else if (isUpdatesActive) {
        renderUpdatesTab(state);
    } else if (isScansActive) { // NOVO BLOCO LÓGICO
        if (state.isLoadingScans) {
            dom.scansContent.innerHTML = `<div class="flex justify-center items-center py-16"><div class="loader"></div></div>`;
        } else if (state.selectedScan) {
            renderScanWorks(state);
        } else {
            renderScansList(state);
        }
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

    if (!isUpdatesActive && !isScansActive) { // MODIFICADO
      renderCards(dom.contentContainer, itemsToDisplay, state.favorites);
      if (state.activeTab === 'library') {
          renderPagination(dom.paginationControls, totalPaginationItems, state.currentPage);
      } else {
          dom.paginationControls.innerHTML = '';
      }
    }
}