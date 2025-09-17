import { getMangaCache, setMangaCache, getMangaCacheVersion, setMangaCacheVersion, clearMangaCache } from './cache.js';
import { INDEX_URL, PROXIES } from './constants.js';

// --- Lógica de Rede ---
const fetchWithTimeout = async (resource, options = { timeout: 20000 }) => {
    const { timeout } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(id);
    }
};

// --- Lógica de Processamento de Dados ---
const b64DecodeUnicode = (str) => {
    return decodeURIComponent(atob(str).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
};

const processMangaUrl = async (chapterUrl, preFetchedData = {}) => {
    try {
        const cubariMatch = chapterUrl.match(/cubari\.moe\/read\/gist\/([^/]+)/);
        if (!cubariMatch) return { url: chapterUrl, error: true, title: preFetchedData.title || 'URL Inválida' };

        const base64url = decodeURIComponent(cubariMatch[1]);
        let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) { b64 += '='; }
        
        let decodedPath = b64DecodeUnicode(b64);

        if (decodedPath.startsWith('raw/')) decodedPath = decodedPath.substring(4);
        decodedPath = decodedPath.replace('/refs/heads/', '/');
        
        const pathSegments = decodedPath.split('/');
        const encodedPath = pathSegments.map(segment => encodeURIComponent(segment)).join('/');
        
        const jsonUrl = `https://raw.githubusercontent.com/${encodedPath}`;

        const response = await fetchWithTimeout(jsonUrl);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        
        const data = await response.json();
        
        const latestChapter = Object.values(data.chapters || {}).reduce((latest, chap) => 
            !latest || parseInt(chap.last_updated) > parseInt(latest.last_updated) ? chap : latest, null);
        
        const imageUrl = preFetchedData.cover_url 
            ? preFetchedData.cover_url 
            : (data.cover ? `${PROXIES[0]}${encodeURIComponent(data.cover)}` : 'https://placehold.co/256x384/1f2937/7ca3f5?text=Sem+Capa');

        return {
            url: chapterUrl,
            title: preFetchedData.title || data.title || 'N/A',
            description: data.description || '',
            imageUrl: imageUrl,
            author: data.author,
            artist: data.artist,
            genres: data.genres,
            type: preFetchedData.type || null, // O tipo virá do preFetchedData
            status: data.status,
            chapters: data.chapters, // Mantém a correção anterior
            chapterCount: data.chapters ? Object.keys(data.chapters).length : null,
            lastUpdated: latestChapter ? parseInt(latestChapter.last_updated) * 1000 : 0,
            error: false
        };
    } catch (error) {
        console.error(`Falha ao processar ${chapterUrl} para a obra "${preFetchedData.title}":`, error);
        return { url: chapterUrl, title: preFetchedData.title || 'Falha ao Carregar', description: error.message, imageUrl: 'https://placehold.co/256x384/1f2937/ef4444?text=Erro', error: true };
    }
};

// --- FUNÇÃO PARA PROCESSAMENTO EM LOTES (MODIFICADA) ---
async function processInBatches(items, batchSize, delay, updateStatus) {
    let results = [];
    // 'items' agora é um array de [chave, dados], ex: ["KR1611", {title: ...}]
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        const batchPromises = batch.map(([key, mangaSeries]) => { // Desestruturação para pegar a chave e os dados
            const representativeChapter = mangaSeries.chapters[0];
            if (!representativeChapter || !representativeChapter.url) {
                console.warn('Série sem capítulos ou URL válida:', mangaSeries.title);
                return null;
            }

            // **NOVA LÓGICA PARA DETERMINAR O TIPO PELA CHAVE**
            let type = null;
            if (key.startsWith('KR')) {
                type = 'manhwa';
            } else if (key.startsWith('JP')) {
                type = 'manga';
            } else if (key.startsWith('CH')) {
                type = 'manhua';
            }

            const preFetchedData = {
                title: mangaSeries.title,
                cover_url: representativeChapter.cover_url || null,
                type: type // Usamos o tipo que acabamos de determinar
            };
            return processMangaUrl(representativeChapter.url, preFetchedData);

        }).filter(p => p !== null);

        const batchResults = await Promise.all(batchPromises);
        results = results.concat(batchResults);

        updateStatus(`Processando ${results.length} de ${items.length} obras...`);
        
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return results;
}

// --- FUNÇÃO PRINCIPAL (MODIFICADA) ---
export async function fetchAndProcessMangaData(updateStatus) {
    updateStatus('Verificando por atualizações...');
    
    const response = await fetchWithTimeout(INDEX_URL);
    if (!response.ok) throw new Error(`Falha ao carregar o índice: ${response.status}`);
    const indexData = await response.json();
    
    const remoteVersion = indexData.metadata.version;
    const localVersion = getMangaCacheVersion();

    if (remoteVersion === localVersion) {
        const cachedData = getMangaCache();
        if (cachedData) {
            updateStatus(`Catálogo atualizado. Carregando ${cachedData.length} obras do cache...`);
            return { data: cachedData, updated: false };
        }
    }
    
    updateStatus('Nova versão encontrada! Atualizando o catálogo...');
    clearMangaCache();

    // **MUDANÇA AQUI: De Object.values para Object.entries**
    // Isso nos dá acesso tanto à chave (ex: "KR1611") quanto ao valor (os dados do mangá)
    const allMangaSeries = Object.entries(indexData.mangas);
    
    const allMangaResults = await processInBatches(allMangaSeries, 100, 1000, updateStatus);
    
    const allManga = allMangaResults.filter(m => m && !m.error);

    setMangaCache(allManga);
    setMangaCacheVersion(remoteVersion);
    
    return { data: allManga, updated: true };
}
