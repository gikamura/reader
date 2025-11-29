import { getMangaCache, setMangaCache, getMangaCacheVersion, setMangaCacheVersion, clearMangaCache } from './cache.js';
import { INDEX_URL } from './constants.js';
import { errorNotificationManager } from './error-handler.js';

// Importar utilitários compartilhados
import './shared-utils.js';

// Usar funções do módulo compartilhado
const { fetchWithTimeout, b64DecodeUnicode, validateUrl, sanitizeInput, processMangaUrl, processInBatches } = window.SharedUtils;

// Funções compartilhadas agora disponíveis via window.SharedUtils

export async function fetchAndProcessMangaData(updateStatus, onBatchProcessed) {
    updateStatus('Verificando por atualizações...');

    try {
        // Buscar diretamente do GitHub (raw.githubusercontent.com não tem CORS)
        updateStatus('Buscando índice do GitHub...');
        const response = await fetchWithTimeout(INDEX_URL, { timeout: 15000 });
        if (!response.ok) throw new Error(`Falha ao carregar o índice: ${response.status}`);
        const indexData = await response.json();

        const remoteVersion = indexData.metadata?.version || Date.now();
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

        // Usar função compartilhada com configurações otimizadas
        const allMangaResults = await processInBatches(allMangaSeries, 200, 300, onBatchProcessed);

        const allManga = allMangaResults.filter(m => m && !m.error);
        const failedCount = allMangaResults.length - allManga.length;

        // Feedback melhorado com estatísticas
        if (failedCount > 0) {
            console.warn(`${failedCount} mangás falharam ao carregar de ${allMangaResults.length} total`);
            updateStatus(`Carregado: ${allManga.length} de ${allMangaResults.length} mangás (${failedCount} falharam)`);
        } else {
            updateStatus(`${allManga.length} mangás carregados com sucesso`);
        }

        await setMangaCache(allManga);
        await setMangaCacheVersion(remoteVersion);

        return {
            data: allManga,
            updated: true,
            stats: {
                total: allMangaResults.length,
                successful: allManga.length,
                failed: failedCount
            }
        };
    } catch (error) {
        console.error('Erro crítico ao buscar dados:', error);

        if (error.name === 'AbortError' || error.message.includes('timeout')) {
            errorNotificationManager.showNetworkError();
        } else {
            errorNotificationManager.showCriticalError(
                `Erro ao carregar dados: ${error.message}`
            );
        }

        throw error;
    }
}
