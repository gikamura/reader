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

const fetchViaProxies = async (targetUrl) => {
    for (const proxy of PROXIES) {
        try {
            const response = await fetchWithTimeout(`${proxy}${encodeURIComponent(targetUrl)}`);
            if (response.ok) return response;
        } catch (error) {
            console.warn(`Proxy ${proxy} falhou para ${targetUrl}:`, error);
        }
    }
    throw new Error(`Todos os proxies falharam para ${targetUrl}`);
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
        
        let decodedPath;
        try {
            decodedPath = b64DecodeUnicode(b64);
        } catch(e) { throw new Error("Falha na decodificação Base64."); }

        if (decodedPath.startsWith('raw/')) decodedPath = decodedPath.substring(4);
        decodedPath = decodedPath.replace('/refs/heads/', '/');
        const jsonUrl = `https://raw.githubusercontent.com/${decodedPath}`;

        const response = await fetchWithTimeout(jsonUrl);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const data = await response.json();
        
        const latestChapter = Object.values(data.chapters || {}).reduce((latest, chap) => 
            !latest || parseInt(chap.last_updated) > parseInt(latest.last_updated) ? chap : latest, null);

        // --- LÓGICA DA IMAGEURL CORRIGIDA ---
        // 1. Prioriza a cover_url (hotlink, sem proxy).
        // 2. Se não existir, usa a data.cover do gist (com proxy, como fallback).
        // 3. Se nenhuma existir, usa o placeholder.
        const imageUrl = preFetchedData.cover_url 
            ? preFetchedData.cover_url 
            : (data.cover ? `${PROXIES[0]}${encodeURIComponent(data.cover)}` : 'https://placehold.co/256x384/1f2937/7ca3f5?text=Sem+Capa');

        return {
            url: chapterUrl,
            title: preFetchedData.title || data.title || 'N/A',
            description: data.description || '',
            imageUrl: imageUrl, // Usa a variável com a lógica corrigida
            author: data.author,
            artist: data.artist,
            genres: data.genres,
            type: preFetchedData.type || null,
            status: data.status,
            chapterCount: data.chapters ? Object.keys(data.chapters).length : null,
            lastUpdated: latestChapter ? parseInt(latestChapter.last_updated) * 1000 : 0,
            error: false
        };
    } catch (error) {
        console.error(`Falha ao processar ${chapterUrl} para a obra "${preFetchedData.title}":`, error);
        return { url: chapterUrl, title: preFetchedData.title || 'Falha ao Carregar', description: error.message, imageUrl: 'https://placehold.co/256x384/1f2937/ef4444?text=Erro', error: true };
    }
};

/**
 * Orquestra a busca de dados, verificando a versão para usar o cache de forma inteligente.
 */
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

    const mangaDetailsPromises = Object.values(indexData.mangas).map(mangaSeries => {
        const representativeChapter = mangaSeries.chapters[0];
        if (!representativeChapter || !representativeChapter.url) {
            console.warn('Série sem capítulos ou URL válida:', mangaSeries.title);
            return null;
        }

        const preFetchedData = {
            title: mangaSeries.title,
            cover_url: representativeChapter.cover_url || null,
            type: representativeChapter.type || null
        };

        return processMangaUrl(representativeChapter.url, preFetchedData);
    }).filter(p => p !== null);

    updateStatus(`Processando ${mangaDetailsPromises.length} obras...`);
    const allMangaResults = await Promise.all(mangaDetailsPromises);
    
    // Filtra obras que resultaram em erro antes de salvar no cache
    const allManga = allMangaResults.filter(m => m && !m.error);

    setMangaCache(allManga);
    setMangaCacheVersion(remoteVersion);
    
    return { data: allManga, updated: true };
}
