import { getMangaCache, setMangaCache } from './cache.js';
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

const processMangaUrl = async (chapterUrl) => {
    try {
        const cubariMatch = chapterUrl.match(/cubari\.moe\/read\/gist\/([^/]+)/);
        if (!cubariMatch) return { url: chapterUrl, error: true, title: 'URL Inválida' };

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

        return {
            url: chapterUrl,
            title: data.title || 'N/A',
            description: data.description || '',
            imageUrl: data.cover ? `${PROXIES[0]}${encodeURIComponent(data.cover)}` : 'https://placehold.co/256x384/1f2937/7ca3f5?text=Sem+Capa',
            author: data.author,
            artist: data.artist,
            genres: data.genres,
            status: data.status,
            chapterCount: data.chapters ? Object.keys(data.chapters).length : null,
            lastUpdated: latestChapter ? parseInt(latestChapter.last_updated) * 1000 : 0,
            error: false
        };
    } catch (error) {
        console.error(`Falha ao processar ${chapterUrl}:`, error);
        return { url: chapterUrl, title: 'Falha ao Carregar', description: error.message, imageUrl: 'https://placehold.co/256x384/1f2937/ef4444?text=Erro', error: true };
    }
};

/**
 * Orquestra a busca de dados, usando cache se disponível.
 * @param {Function} updateStatus - Callback para atualizar a UI com mensagens de status.
 * @returns {Promise<Array>} - A lista de dados dos mangás.
 */
export async function fetchAndProcessMangaData(updateStatus) {
    const cachedData = getMangaCache();
    if (cachedData) {
        updateStatus(`Carregando ${cachedData.length} obras do cache...`);
        return cachedData;
    }

    updateStatus('Buscando índice de obras na rede...');
    const response = await fetchWithTimeout(INDEX_URL);
    if (!response.ok) throw new Error(`Falha ao carregar o índice: ${response.status}`);
    const indexData = await response.json();
    
    const urls = [];
    if (indexData.mangas) {
        for (const key in indexData.mangas) {
            indexData.mangas[key].chapters.forEach(chap => urls.push(chap.url));
        }
    }

    updateStatus(`Processando ${urls.length} obras...`);
    const mangaDetailsPromises = urls.map(processMangaUrl);
    const allManga = await Promise.all(mangaDetailsPromises);
    
    setMangaCache(allManga);
    return allManga;
}
