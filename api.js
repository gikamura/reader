import { getMangaCache, setMangaCache, getMangaCacheVersion, setMangaCacheVersion, clearMangaCache } from './cache.js';
import { INDEX_URL, PROXIES } from './constants.js';

// --- Lógica de Rede (sem alterações) ---
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
            console.log(`[DEBUG] Tentando proxy: ${proxy} para URL: ${targetUrl}`);
            const response = await fetchWithTimeout(`${proxy}${encodeURIComponent(targetUrl)}`);
            if (response.ok) {
                console.log(`[DEBUG] Proxy ${proxy} funcionou!`);
                return response;
            }
            console.warn(`[DEBUG] Proxy ${proxy} retornou status não-OK: ${response.status}`);
        } catch (error) {
            console.warn(`[DEBUG] Proxy ${proxy} falhou para ${targetUrl}:`, error);
        }
    }
    throw new Error(`[DEBUG] Todos os proxies falharam para ${targetUrl}`);
};

// --- Lógica de Processamento de Dados (com logs de depuração) ---
const b64DecodeUnicode = (str) => {
    try {
        return decodeURIComponent(atob(str).split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (e) {
        console.error("[DEBUG] Erro na decodificação Base64:", e, "String original:", str);
        throw new Error("Falha na decodificação Base64.");
    }
};

const processMangaUrl = async (chapterUrl, preFetchedData = {}) => {
    console.log(`[DEBUG] Processando obra: "${preFetchedData.title}" com URL: ${chapterUrl}`);
    try {
        const cubariMatch = chapterUrl.match(/cubari\.moe\/read\/gist\/([^/]+)/);
        if (!cubariMatch) {
            console.error(`[DEBUG] ERRO DE REGEX: A URL "${chapterUrl}" não corresponde ao padrão esperado.`);
            return { url: chapterUrl, error: true, title: preFetchedData.title || 'URL Inválida' };
        }

        const base64url = decodeURIComponent(cubariMatch[1]);
        let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) { b64 += '='; }
        
        const decodedPath = b64DecodeUnicode(b64);
        
        if (!decodedPath) {
             console.error(`[DEBUG] ERRO: O caminho decodificado está vazio para a obra "${preFetchedData.title}".`);
             return { url: chapterUrl, error: true, title: preFetchedData.title, description: "Caminho decodificado inválido" };
        }
        
        const finalDecodedPath = decodedPath.startsWith('raw/') ? decodedPath.substring(4) : decodedPath.replace('/refs/heads/', '/');
        const jsonUrl = `https://raw.githubusercontent.com/${finalDecodedPath}`;
        console.log(`[DEBUG] URL do JSON de detalhes construída: ${jsonUrl}`);

        const response = await fetchViaProxies(jsonUrl);
        if (!response.ok) throw new Error(`Status da resposta: ${response.status}`);
        
        const data = await response.json();
        console.log(`[DEBUG] Dados recebidos com sucesso para "${data.title || preFetchedData.title}"`);
        
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
            chapterCount: data.chapters ? Object.keys(data.chapters).length : null,
            lastUpdated: latestChapter ? parseInt(latestChapter.last_updated) * 1000 : 0,
            error: false
        };
    } catch (error) {
        console.error(`[DEBUG] ERRO FATAL ao processar ${chapterUrl} para a obra "${preFetchedData.title}":`, error);
        return { url: chapterUrl, title: preFetchedData.title || 'Falha ao Carregar', description: error.message, imageUrl: 'https://placehold.co/256x384/1f2937/ef4444?text=Erro', error: true };
    }
};

export async function fetchAndProcessMangaData(updateStatus) {
    updateStatus('Verificando por atualizações...');
    console.log("[DEBUG] Iniciando fetchAndProcessMangaData");
    
    const response = await fetchWithTimeout(INDEX_URL);
    if (!response.ok) throw new Error(`Falha ao carregar o índice: ${response.status}`);
    const indexData = await response.json();
    console.log(`[DEBUG] Índice principal carregado. Versão: ${indexData.metadata.version}. Total de obras no índice: ${Object.keys(indexData.mangas).length}`);
    
    const remoteVersion = indexData.metadata.version;
    const localVersion = getMangaCacheVersion();

    if (remoteVersion === localVersion) {
        const cachedData = getMangaCache();
        if (cachedData) {
            console.log("[DEBUG] Usando dados do cache. Versão local e remota são iguais.");
            updateStatus(`Catálogo atualizado. Carregando ${cachedData.length} obras do cache...`);
            return { data: cachedData, updated: false };
        }
    }
    
    updateStatus('Nova versão encontrada! Atualizando o catálogo...');
    clearMangaCache();

    const mangaList = Object.values(indexData.mangas);
    console.log(`[DEBUG] Processando ${mangaList.length} obras da lista.`);

    const mangaDetailsPromises = mangaList.map(mangaSeries => {
        const representativeChapter = mangaSeries.chapters[0];
        if (!representativeChapter || !representativeChapter.url) {
            console.warn('[DEBUG] Série sem capítulos ou URL válida:', mangaSeries.title);
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
    console.log(`[DEBUG] Todos os processamentos terminaram. Total de resultados (antes de filtrar): ${allMangaResults.length}`);
    
    const allManga = allMangaResults.filter(m => m && !m.error);
    console.log(`[DEBUG] Obras processadas com SUCESSO (após filtrar erros): ${allManga.length}`);
    
    if (allManga.length < 5 && allMangaResults.length > 5) {
        console.error("[DEBUG] ALERTA: A maioria das obras falhou ao carregar. Verifique os logs de erro acima.");
    }

    setMangaCache(allManga);
    setMangaCacheVersion(remoteVersion);
    
    return { data: allManga, updated: true };
}
