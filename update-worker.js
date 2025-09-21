// Importar utilitários compartilhados usando importScripts para Web Workers
importScripts('./shared-utils.js');

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
