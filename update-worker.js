// update-worker.js
importScripts('./constants.js', './cache.js', './api.js');

self.onmessage = async (event) => {
    if (event.data && event.data.command === 'start-fetch') {
        try {
            const onBatchProcessed = (batch) => {
                // Envia cada lote processado de volta para a thread principal
                self.postMessage({ type: 'batch-processed', payload: batch });
            };

            const { data: finalMangaData, updated } = await fetchAndProcessMangaData(
                (message) => self.postMessage({ type: 'status-update', payload: message }),
                onBatchProcessed
            );

            // Envia a mensagem de conclusão com os dados finais
            self.postMessage({ type: 'complete', payload: { data: finalMangaData, updated } });
        } catch (error) {
            self.postMessage({ type: 'error', payload: error.message });
        }
    }
};
