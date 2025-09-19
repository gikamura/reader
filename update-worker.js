// Constantes do Worker
const INDEX_URL = 'https://raw.githubusercontent.com/gikawork/data/refs/heads/main/hub/index.json';

// Fetch robusto com timeout e retry melhorado
const fetchWithTimeout = async (resource, options = { timeout: 45000 }) => {
    const { timeout, retries = 3, ...fetchOptions } = options;

    for (let attempt = 0; attempt <= retries; attempt++) {
        let timeoutId;
        let controller;

        try {
            controller = new AbortController();

            // Timeout Promise com limpeza adequada
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    if (!controller.signal.aborted) {
                        controller.abort();
                    }
                    reject(new Error(`Request timeout after ${timeout}ms (attempt ${attempt + 1})`));
                }, timeout);
            });

            // Fetch Promise
            const fetchPromise = fetch(resource, {
                ...fetchOptions,
                signal: controller.signal,
                cache: 'no-cache'
            }).then(response => {
                // Limpar timeout imediatamente quando response chega
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                return response;
            });

            // Race com cleanup adequado
            const response = await Promise.race([fetchPromise, timeoutPromise]);

            // Verificar se response é válido
            if (!response || typeof response.ok === 'undefined') {
                throw new Error('Invalid response received');
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;

        } catch (error) {
            // Cleanup de timeout e controller
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            // Se é a última tentativa, throw error
            if (attempt === retries) {
                throw new Error(`Failed after ${retries + 1} attempts: ${error.message}`);
            }

            // Delay progressivo antes do retry
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
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

        const response = await fetchWithTimeout(jsonUrl, { timeout: 20000 });
        if (!response.ok) throw new Error(`Status: ${response.status}`);

        const data = await response.json();

        const latestChapter = Object.values(data.chapters || {}).reduce((latest, chap) =>
            !latest || parseInt(chap.last_updated) > parseInt(latest.last_updated) ? chap : latest, null);

        const imageUrl = preFetchedData.cover_url
            ? preFetchedData.cover_url
            : (data.cover ? data.cover : 'https://placehold.co/256x384/1f2937/7ca3f5?text=Sem+Capa');

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

async function fetchAndProcessMangaData(updateStatus, onBatchProcessed) {
    updateStatus('Verificando por atualizações...');

    try {
        updateStatus('Buscando índice do GitHub...');
        const response = await fetchWithTimeout(INDEX_URL, { timeout: 25000 });
        if (!response.ok) throw new Error(`Falha ao carregar o índice: ${response.status}`);
        const indexData = await response.json();

        updateStatus('Processando dados do catálogo...');
        const allMangaSeries = Object.entries(indexData.mangas);

        const allMangaResults = await processInBatches(allMangaSeries, 100, 1000, onBatchProcessed);

        const allManga = allMangaResults.filter(m => m && !m.error);
        const failedCount = allMangaResults.length - allManga.length;

        if (failedCount > allManga.length) {
            console.warn(`${failedCount} mangás falharam ao carregar`);
            updateStatus(`Carregado parcialmente: ${allManga.length} de ${allMangaResults.length} mangás`);
        } else {
            updateStatus(`${allManga.length} mangás carregados com sucesso`);
        }

        return {
            data: allManga,
            updated: true,
            version: indexData.metadata.version
        };
    } catch (error) {
        console.error('Erro crítico ao buscar dados:', error);
        throw error;
    }
}

self.onmessage = async (event) => {
    if (event.data && event.data.command === 'start-fetch') {
        try {
            const onBatchProcessed = (batch) => {
                self.postMessage({ type: 'batch-processed', payload: batch });
            };

            const { data: finalMangaData, updated } = await fetchAndProcessMangaData(
                (message) => self.postMessage({ type: 'status-update', payload: message }),
                onBatchProcessed
            );

            self.postMessage({ type: 'complete', payload: { data: finalMangaData, updated } });
        } catch (error) {
            self.postMessage({ type: 'error', payload: error.message });
        }
    }
};
