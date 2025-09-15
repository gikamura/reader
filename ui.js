// ui.js

const createCardHTML = (data, isFavorite) => {
    // ... (código dos ícones e variáveis permanece o mesmo) ...
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
    <div class="relative bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-transform transform hover:-translate-y-1 hover:shadow-2xl group" style="height: 16rem;">
        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="relative flex flex-grow w-full h-full">
            <div class="w-1/3 flex-shrink-0 bg-gray-900">
                <img src="${data.imageUrl}" alt="Capa de ${data.title}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/256x384/1f2937/7ca3f5?text=Inválida';">
            </div>
            <div class="flex flex-col flex-grow p-4 text-white overflow-hidden w-2/3">
                <div class="h-10"></div> 
                <div class="relative flex-grow">
                     <p class="text-sm text-gray-400 leading-snug line-clamp-4 flex-grow" style="-webkit-box-orient: vertical;">${description}</p>
                    <div class="absolute inset-0 bg-gray-800 p-2 text-sm text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-auto pointer-events-none rounded">${description}</div>
                </div>
                <div class="mt-auto pt-3 border-t border-gray-700 text-xs flex items-center justify-start space-x-4 overflow-hidden">
                    ${createCardMetadata(iconUser, 'Autor', author)}
                    ${createCardMetadata(iconPaintBrush, 'Artista', artist)}
                    ${createCardMetadata(iconBookOpen, 'Capítulos', chapterCount)}
                </div>
            </div>
            <div class="absolute top-0 left-0 right-0 px-4 py-2 bg-gradient-to-b from-black/70 to-transparent z-10 pointer-events-none">
                 <h3 class="text-lg font-bold truncate text-white" title="${data.title}">${data.title}</h3>
            </div>
            <div class="absolute bottom-2 left-2 flex items-center gap-2 z-10">
                 <span class="bg-gray-900/70 text-white font-semibold px-2 py-1 rounded-md text-xs backdrop-blur-sm" title="Status">${status}</span>
                 <span class="bg-blue-600 text-white font-semibold px-2 py-1 rounded-md text-xs">${type}</span>
            </div>
        </a>
        <button class="favorite-btn absolute top-2 right-2 p-1.5 bg-gray-900/50 rounded-full text-white hover:text-red-500 backdrop-blur-sm transition-colors z-20" data-url="${data.url}" title="Favoritar">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" class="${isFavorite ? 'text-red-500' : 'text-white/80'}" clip-rule="evenodd" />
            </svg>
        </button>
    </div>`;
};
