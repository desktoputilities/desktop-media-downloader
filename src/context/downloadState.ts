import type { DownloadItem, DownloadSettings } from './DownloadContext';

export const PLACEHOLDER_TITLE = 'Preparing download...';

export interface DownloadStateRecord {
    url: string;
    status: string;
}

// Options to restart a queue item when the main process no longer holds the originals.
// The title and template must match the first run or yt-dlp cannot find the partial file.
export const buildRestartOptions = (download: DownloadItem, settings: DownloadSettings) => ({
    id: download.id,
    url: download.url,
    titleOverride: download.title === PLACEHOLDER_TITLE ? undefined : download.title,
    format: download.format || 'video',
    quality: download.quality,
    cookiesFromBrowser: settings.cookiesFromBrowser,
    embedSubtitles: settings.embedSubtitles,
    subtitleLanguages: settings.subtitleLanguages,
    embedMetadata: settings.embedMetadata,
    preserveThumbnail: settings.preserveThumbnail,
    embedAltAudio: settings.embedAltAudio,
    preferredAudioLang: settings.preferredAudioLang,
    enableTurboDownload: download.enableTurboDownload ?? settings.enableTurboDownload,
    adaptiveTurboDownload: download.adaptiveTurboDownload ?? settings.adaptiveTurboDownload,
    turboConnections: download.turboConnections ?? settings.turboConnections,
    photoTimestampMode: download.photoTimestampMode,
    audioFormat: download.audioFormat,
    expectedBytes: download.expectedBytes,
    outputDir: download.outputDir,
    fileNameTemplate: download.fileNameTemplate ?? settings.fileNameTemplate,
});

// One key per media item: YouTube links by video id, other links without
// timestamps or fragments.
export const getMetadataCacheKey = (rawUrl: string): string => {
    try {
        const parsed = new URL(rawUrl);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        const isYouTube = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');

        if (isYouTube) {
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            const id = host === 'youtu.be'
                ? pathParts[0]
                : parsed.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(pathParts[0]) ? pathParts[1] : undefined);
            if (id) return `youtube:${id}`;
        }

        parsed.searchParams.delete('t');
        parsed.searchParams.delete('start');
        parsed.searchParams.delete('time_continue');
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return rawUrl.trim();
    }
};

export const findHistoryMatch = <T extends { url: string }>(history: T[], url: string): T | undefined => {
    const key = getMetadataCacheKey(url);
    return history.find(item => getMetadataCacheKey(item.url) === key);
};

// Finished items live on in History; the queue keeps only the newest few for
// Home's recent list, so saved state stays small.
export const MAX_COMPLETED_IN_QUEUE = 20;

export const trimCompletedDownloads = <T extends DownloadStateRecord & { completedAt?: string }>(
    downloads: T[],
    limit = MAX_COMPLETED_IN_QUEUE,
): T[] => {
    const completed = downloads.filter(d => d.status === 'completed');
    if (completed.length <= limit) return downloads;
    const keep = new Set(
        [...completed]
            .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
            .slice(0, limit)
    );
    return downloads.filter(d => d.status !== 'completed' || keep.has(d));
};

export const DEFAULT_MAX_PARALLEL_DOWNLOADS = 3;

// Ids of queued items to start now, oldest first. The list is newest-first, and
// 'pending' (preparing) and 'downloading' items hold a slot; paused ones do not.
export const pickQueuedToStart = <T extends DownloadStateRecord & { id: string }>(
    downloads: T[],
    maxParallel: number,
): string[] => {
    const running = downloads.filter(d => d.status === 'pending' || d.status === 'downloading').length;
    const slots = Math.max(0, Math.floor(maxParallel) - running);
    if (slots === 0) return [];
    return downloads
        .filter(d => d.status === 'queued')
        .reverse()
        .slice(0, slots)
        .map(d => d.id);
};

// Writes the latest value at most once per delay. A debounce would never fire
// while progress updates keep arriving, so the queue would go unsaved.
export const createThrottledWriter = <T>(write: (value: T) => void, delayMs: number) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latest: T;

    return {
        schedule: (value: T) => {
            latest = value;
            if (timer !== null) return;
            timer = setTimeout(() => {
                timer = null;
                write(latest);
            }, delayMs);
        },
        cancel: () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
        },
    };
};

export const isTerminalDownload = (download: DownloadStateRecord): boolean => (
    download.status === 'completed' || download.status === 'error'
);

export const removeRelatedTerminalDownloads = <T extends DownloadStateRecord>(
    downloads: T[],
    sourceUrl: string
): T[] => downloads.filter(download => (
    download.url !== sourceUrl || !isTerminalDownload(download)
));

export const removeAllTerminalDownloads = <T extends DownloadStateRecord>(downloads: T[]): T[] => (
    downloads.filter(download => !isTerminalDownload(download))
);
