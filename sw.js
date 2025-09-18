// REMOVIDO: importScripts(...)

// ADICIONADO: importações de módulo
import { getMangaCache, loadUpdatesFromCache, saveUpdatesToCache, getLastCheckTimestamp, setLastCheckTimestamp } from './cache.js';
import { fetchAndProcessMangaData } from './api.js';

const NOTIFICATION_TAG = 'gikamura-update';

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-for-updates') {
        event.waitUntil(handleUpdateCheck());
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/#updates')
    );
});

async function findNewChapterUpdates(oldManga, newManga) {
    const oldMangaMap = new Map(oldManga.map(m => [m.url, m]));
    const newUpdates = [];
    const lastCheckTimestamp = parseInt(await getLastCheckTimestamp() || '0');

    newManga.forEach(manga => {
        const oldVersion = oldMangaMap.get(manga.url);
        if (!oldVersion || !manga.chapters) return;

        const newChaptersInManga = [];
        for (const chapterKey in manga.chapters) {
            if (!oldVersion.chapters || !oldVersion.chapters[chapterKey]) {
                const newChapter = manga.chapters[chapterKey];
                const chapterTimestamp = parseInt(newChapter.last_updated) * 1000;
                if (chapterTimestamp > lastCheckTimestamp) {
                    newChaptersInManga.push({
                        title: newChapter.title || `Capítulo ${chapterKey}`,
                        timestamp: chapterTimestamp,
                    });
                }
            }
        }
        if (newChaptersInManga.length > 0) {
            newUpdates.push({
                manga: manga,
                newChapters: newChaptersInManga.sort((a,b) => b.timestamp - a.timestamp),
                timestamp: Date.now()
            });
        }
    });
    return newUpdates.sort((a, b) => b.timestamp - a.timestamp);
}

async function handleUpdateCheck() {
    console.log('[Service Worker] Verificando atualizações em segundo plano...');
    try {
        const oldData = await getMangaCache();
        if (!oldData || oldData.length === 0) {
            console.log('[Service Worker] Cache local vazio, pulando verificação.');
            return;
        }

        const { data: newData, updated } = await fetchAndProcessMangaData(() => {});

        if (updated) {
            const updates = await findNewChapterUpdates(oldData, newData);

            if (updates.length > 0) {
                console.log(`[Service Worker] ${updates.length} atualizações encontradas.`);
                const updatesWithReadState = updates.map(u => ({ ...u, read: false }));
                const currentUpdates = await loadUpdatesFromCache();
                await saveUpdatesToCache([...updatesWithReadState, ...currentUpdates]);
                await setLastCheckTimestamp(Date.now().toString());

                const title = 'Gikamura - Novas Atualizações!';
                const body = updates.length === 1
                    ? `Novo capítulo em "${updates[0].manga.title}"!`
                    : `${updates.length} obras foram atualizadas. Clique para ver.`;

                await self.registration.showNotification(title, {
                    body: body,
                    icon: '/icon-192.png',
                    badge: '/badge-72.png',
                    tag: NOTIFICATION_TAG
                });
            } else {
                console.log('[Service Worker] Nenhum novo capítulo encontrado.');
            }
        } else {
            console.log('[Service Worker] Catálogo já estava atualizado.');
        }
    } catch (error) {
        console.error('[Service Worker] Erro durante a verificação de atualizações:', error);
    }
}
