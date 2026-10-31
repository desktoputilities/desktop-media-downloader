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
    outputDir: download.outputDir,
    fileNameTemplate: download.fileNameTemplate ?? settings.fileNameTemplate,
});

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
