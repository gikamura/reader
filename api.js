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

// --- NOVA FUNÇÃO PARA CONVERTER IMAGEM PARA BASE64 ---
const imageUrlToBase64 = async (url) => {
    if (!url || url.includes('placehold.co')) {
        // Retorna a URL do placeholder diretamente, sem tentar converter.
        return 'https://placehold.co/256x384/1f2937/7ca3f5?text=Inválida';
    }
    try {
        // Usa um proxy para evitar problemas de CORS com as imagens
        const proxyUrl = `${PROXIES[0]}${encodeURIComponent(url)}`;
        const response = await fetchWithTimeout(proxyUrl);
        if (!response.ok) throw new Error(`Falha ao buscar imagem: ${response.statusText}`);
        
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`Não foi possível converter a imagem ${url} para Base64:`, error);
        // Retorna uma imagem de erro em caso de falha
        return 'https://placehold.co/256x384/1f2937/ef4444?text=Erro+Img';
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

        const originalImageUrl = preFetchedData.cover_url || (data.cover ? data.cover : null);
        
        // Converte a URL da imagem para Base64
        const base64Image = await imageUrlToBase64(originalImageUrl);

        return {
            url: chapterUrl,
            title: preFetchedData.title || data.title || 'N/A',
            description: data.description || '',
            imageUrl: base64Image, // Usa a imagem em Base64
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
    
    const allManga = allMangaResults.filter(m => m && !m.error);

    setMangaCache(allManga);
    setMangaCacheVersion(remoteVersion);
    
    return { data: allManga, updated: true };
}
