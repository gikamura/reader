import { getMangaCache, setMangaCache, getMangaCacheVersion, setMangaCacheVersion, clearMangaCache } from './cache.js';
import { INDEX_URL, PROXIES } from './constants.js';
import { RobustFetcher, errorNotificationManager } from './error-handler.js';

// Instância global do robust fetcher
const robustFetcher = new RobustFetcher(PROXIES);

// Função wrapper para compatibilidade
const fetchWithTimeout = async (resource, options = { timeout: 20000 }) => {
    try {
        return await robustFetcher.fetchWithTimeout(resource, options);
    } catch (error) {
        console.error('Fetch timeout error:', error);
        throw error;
    }
};

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

        const response = await robustFetcher.fetchWithFallback(jsonUrl);
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
            type: preFetchedData.type || null,
            status: data.status,
            chapters: data.chapters,
            chapterCount: data.chapters ? Object.keys(data.chapters).length : null,
            lastUpdated: latestChapter ? parseInt(latestChapter.last_updated) * 1000 : 0,
            error: false
        };
    } catch (error) {
        console.error(`Falha ao processar ${chapterUrl} para a obra "${preFetchedData.title}":`, error);

        // Notificar erro se for crítico
        if (error.message.includes('Todos os proxies falharam')) {
            errorNotificationManager.showProxyError();
        }

        return {
            url: chapterUrl,
            title: preFetchedData.title || 'Falha ao Carregar',
            description: `Erro: ${error.message}`,
            imageUrl: 'https://placehold.co/256x384/1f2937/ef4444?text=Erro',
            error: true,
            errorDetails: {
                originalError: error.message,
                timestamp: Date.now(),
                retryable: !error.message.includes('URL Inválida')
            }
        };
    }
};

async function processInBatches(items, batchSize, delay, onBatchProcessed) {
    let results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        const batchPromises = batch.map(([key, mangaSeries]) => {
            const representativeChapter = mangaSeries.chapters[0];
            if (!representativeChapter || !representativeChapter.url) {
                console.warn('Série sem capítulos ou URL válida:', mangaSeries.title);
                return null;
            }

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
                type: type
            };
            return processMangaUrl(representativeChapter.url, preFetchedData);

        }).filter(p => p !== null);

        const batchResults = await Promise.all(batchPromises);
        
        if (onBatchProcessed) {
            onBatchProcessed(batchResults);
        }

        results = results.concat(batchResults);
        
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return results;
}

export async function fetchAndProcessMangaData(updateStatus, onBatchProcessed) {
    updateStatus('Verificando por atualizações...');

    try {
        const response = await robustFetcher.fetchWithFallback(INDEX_URL);
        if (!response.ok) throw new Error(`Falha ao carregar o índice: ${response.status}`);
        const indexData = await response.json();

        const remoteVersion = indexData.metadata.version;
        const localVersion = await getMangaCacheVersion();

        if (remoteVersion === localVersion) {
            const cachedData = await getMangaCache();
            if (cachedData) {
                updateStatus(`Catálogo atualizado. Carregando ${cachedData.length} obras do cache...`);
                return { data: cachedData, updated: false };
            }
        }

        updateStatus('Nova versão encontrada! Atualizando o catálogo...');
        await clearMangaCache();

        const allMangaSeries = Object.entries(indexData.mangas);

        const allMangaResults = await processInBatches(allMangaSeries, 100, 1000, onBatchProcessed);

        const allManga = allMangaResults.filter(m => m && !m.error);

        await setMangaCache(allManga);
        await setMangaCacheVersion(remoteVersion);
    
        return { data: allManga, updated: true };
    } catch (error) {
        console.error('Erro crítico ao buscar dados:', error);

        if (error.message.includes('Todos os proxies falharam')) {
            errorNotificationManager.showCriticalError(
                'Não foi possível conectar aos servidores. Verifique sua conexão e tente novamente.'
            );
        } else if (error.name === 'AbortError' || error.message.includes('timeout')) {
            errorNotificationManager.showNetworkError();
        } else {
            errorNotificationManager.showCriticalError(
                `Erro inesperado: ${error.message}`
            );
        }

        throw error;
    }
}
