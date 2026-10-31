import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
    buildRestartOptions,
    createThrottledWriter,
    DEFAULT_MAX_PARALLEL_DOWNLOADS,
    findHistoryMatch,
    getMetadataCacheKey,
    pickQueuedToStart,
    PLACEHOLDER_TITLE,
    removeAllTerminalDownloads,
    removeRelatedTerminalDownloads,
    trimCompletedDownloads,
} from './downloadState';

export type AudioFormat = 'mp3' | 'original';
// 'gallery' saves chosen items of an image post or carousel.
export type DownloadFormat = 'video' | 'audio' | 'photo' | 'gallery';

export interface MediaItem {
    // 1-based position in the post.
    index: number;
    kind: 'video' | 'audio' | 'image';
    url: string;
    ext?: string;
    width?: number;
    height?: number;
    bytes?: number;
    thumbnail?: string;
    // A plain file URL; downloaded directly instead of through gallery-dl.
    direct?: boolean;
}

export interface DownloadItem {
    id: string;
    url: string;
    title: string;
    thumbnail?: string;
    progress: number;
    // 'queued' waits for a free slot; 'pending' is preparing in the main process.
    status: 'queued' | 'pending' | 'downloading' | 'completed' | 'error' | 'paused';
    speed?: string;
    speedBps?: number;
    eta?: string;
    format?: DownloadFormat;
    quality?: string;
    galleryIndices?: number[];
    directUrls?: string[];
    outputDir?: string;
    enableTurboDownload?: boolean;
    adaptiveTurboDownload?: boolean;
    turboConnections?: number;
    photoTimestampMode?: 'screenshot' | 'thumbnail';
    audioFormat?: AudioFormat;
    // Exact size from the format panel; lets progress cover every stream.
    expectedBytes?: number;
    fileNameTemplate?: string;
    // Set from the finished file, so labels show what was actually saved.
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    fileExt?: string;
    // Several files from one post.
    fileCount?: number;
    totalBytes?: number;
    error?: string;
    completedAt?: string;
}

export interface PerDownloadTurboOptions {
    enabled: boolean;
    adaptive?: boolean;
    connections?: number;
}

export interface AddDownloadOptions {
    outputDir?: string;
    turboOverride?: PerDownloadTurboOptions;
    photoTimestampMode?: 'screenshot' | 'thumbnail';
    audioFormat?: AudioFormat;
    expectedBytes?: number;
    galleryIndices?: number[];
    directUrls?: string[];
    // Known metadata (playlists, search, the preview) skips another info call.
    title?: string;
    thumbnail?: string;
}

export interface HistoryItem {
    id: string;
    title: string;
    url: string;
    thumbnail?: string;
    format: DownloadFormat;
    quality?: string;
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    fileExt?: string;
    fileCount?: number;
    totalBytes?: number;
    completedAt: string;
}

export interface VideoInfo {
    id: string;
    title: string;
    thumbnail: string;
    duration: number;
    uploader: string;
    view_count?: number;
    upload_date?: string;
    description?: string;
    webpage_url?: string;
    extractor?: string;
    videoQualities?: number[];
    videoQualitySizes?: Record<string, number>;
    // Formats yt-dlp would actually download for each quality, when resolved.
    videoQualityDetails?: Record<string, { bytes: number; exact: boolean; ext?: string }>;
    // The audio stream an "Original" audio download saves, without conversion.
    audioDetail?: { bytes: number; exact: boolean; ext?: string };
    hasAudio?: boolean;
    extractedUrl?: string;
    extractedSources?: Record<string, string>;
    isPartial?: boolean;
    // What the link holds; 'image' and 'gallery' come with items instead of qualities.
    mediaKind?: 'video' | 'audio' | 'image' | 'gallery';
    items?: MediaItem[];
    // A profile or feed rather than one post.
    isCollection?: boolean;
}

export interface DownloadSettings {
    historyEnabled: boolean;
    defaultQuality: string;
    // Enhanced settings
    embedSubtitles: boolean;
    subtitleLanguages: string[];
    embedMetadata: boolean;
    preserveThumbnail: boolean;
    embedAltAudio: boolean;
    preferredAudioLang: string;
    cookiesFromBrowser: string;
    enableTurboDownload: boolean;
    adaptiveTurboDownload: boolean;
    turboConnections: number;
    maxParallelDownloads: number;
    // File naming
    fileNameTemplate: string;
    // Notifications
    enableNotifications: boolean;
}

interface DownloadContextType {
    findInHistory: (url: string) => HistoryItem | undefined;
    downloads: DownloadItem[];
    history: HistoryItem[];
    settings: DownloadSettings;
    addDownload: (url: string, format?: DownloadFormat, quality?: string, outputDirOrOptions?: string | AddDownloadOptions) => Promise<void>;
    removeDownload: (id: string) => void;
    cancelDownload: (id: string) => Promise<void>;
    pauseDownload: (id: string) => Promise<void>;
    resumeDownload: (id: string) => Promise<void>;
    cancelAllDownloads: () => Promise<void>;
    stopAllDownloads: () => Promise<void>;
    resumeAllDownloads: () => Promise<void>;
    boostDownload: (id: string) => Promise<void>;
    retryDownload: (id: string) => Promise<void>;
    clearCompleted: () => void;
    clearHistory: () => void;
    removeFromHistory: (id: string) => void;
    updateSettings: (settings: Partial<DownloadSettings>) => void;
    // On failure, errorKind says why ('login', 'blocked', ...) and site names the site to sign in to.
    getVideoInfo: (url: string) => Promise<{ success: boolean; data?: VideoInfo; error?: string; errorKind?: string; needsLogin?: boolean; cookiesExpired?: boolean; site?: string }>;
    getFastVideoInfo: (url: string) => Promise<{ success: boolean; data?: VideoInfo; error?: string }>;
    // New methods
    searchVideos: (query: string, platform: string, count?: number) => Promise<any>;
    getPlaylistInfo: (url: string) => Promise<any>;
    getAvailableBrowsers: () => Promise<any>;
    validateBrowserCookies: (browser: string) => Promise<any>;
}

// Window types are defined in vite-env.d.ts

const HISTORY_STORAGE_KEY = 'desktop-media-download-history';
const DOWNLOADS_STORAGE_KEY = 'desktop-media-downloads';
const SETTINGS_STORAGE_KEY = 'desktop-media-settings';
const SAVE_THROTTLE_MS = 1000;
// Progress text and bars read fine at 4 updates/s; per-frame flushes re-rendered every consumer.
const PROGRESS_FLUSH_MS = 250;
const CACHE_TTL_MS = 5 * 60 * 1000;
const QUICK_CACHE_TTL_MS = 30 * 60 * 1000;

const defaultSettings: DownloadSettings = {
    historyEnabled: true,
    defaultQuality: '1080',
    // Enhanced defaults
    embedSubtitles: false,
    subtitleLanguages: ['en', 'tr'],
    embedMetadata: false,
    preserveThumbnail: false,
    embedAltAudio: false,
    preferredAudioLang: 'original',
    cookiesFromBrowser: '',
    enableTurboDownload: false,
    adaptiveTurboDownload: false,
    turboConnections: 8,
    maxParallelDownloads: DEFAULT_MAX_PARALLEL_DOWNLOADS,
    // File naming
    fileNameTemplate: '{title}',
    // Notifications
    enableNotifications: true,
};

const createStorageWriter = <T,>(key: string) => createThrottledWriter<T>((value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Failed to save ${key} to localStorage:`, e);
    }
}, SAVE_THROTTLE_MS);

const downloadsWriter = createStorageWriter<DownloadItem[]>(DOWNLOADS_STORAGE_KEY);
const historyWriter = createStorageWriter<HistoryItem[]>(HISTORY_STORAGE_KEY);
const settingsWriter = createStorageWriter<DownloadSettings>(SETTINGS_STORAGE_KEY);

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [settings, setSettings] = useState<DownloadSettings>(defaultSettings);

    const progressQueue = React.useRef<Map<string, { progress: number; speed?: string; speedBps?: number; eta?: string; queuedAt: number }>>(new Map());
    const progressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    // Start options for queued items, kept until the item launches.
    const launchOptions = React.useRef<Map<string, Record<string, unknown>>>(new Map());
    const launchingIds = React.useRef<Set<string>>(new Set());
    const videoInfoCache = React.useRef<Map<string, { data: VideoInfo; timestamp: number }>>(new Map());
    const videoInfoInflight = React.useRef<Map<string, Promise<{ success: boolean; data?: VideoInfo; error?: string }>>>(new Map());
    const quickVideoInfoCache = React.useRef<Map<string, { data: VideoInfo; timestamp: number }>>(new Map());
    const quickVideoInfoInflight = React.useRef<Map<string, Promise<{ success: boolean; data?: VideoInfo; error?: string }>>>(new Map());

    // Load history, downloads, and settings from localStorage on mount
    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
            const resolvedSettings: DownloadSettings = savedSettings
                ? { ...defaultSettings, ...JSON.parse(savedSettings) }
                : defaultSettings;

            setSettings(resolvedSettings);

            const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
            if (resolvedSettings.historyEnabled && savedHistory) {
                setHistory(JSON.parse(savedHistory));
            } else {
                // Privacy-first behavior: never retain hidden history when tracking is off.
                setHistory([]);
                localStorage.removeItem(HISTORY_STORAGE_KEY);
            }

            const savedDownloads = localStorage.getItem(DOWNLOADS_STORAGE_KEY);
            if (savedDownloads) {
                // Restore downloads, marking any that were in progress as interrupted
                const parsedDownloads: DownloadItem[] = JSON.parse(savedDownloads);
                const restoredDownloads = parsedDownloads.map(d => {
                    if (d.status === 'downloading' || d.status === 'pending') {
                        // Mark interrupted downloads as error so user can retry
                        return { ...d, status: 'error' as const, error: 'Download was interrupted' };
                    }
                    return d;
                });
                setDownloads(restoredDownloads);
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
    }, []);

    useEffect(() => () => {
        downloadsWriter.cancel();
        historyWriter.cancel();
        settingsWriter.cancel();
        if (progressTimer.current) clearTimeout(progressTimer.current);
    }, []);

    useEffect(() => {
        downloadsWriter.schedule(downloads);
    }, [downloads]);

    useEffect(() => {
        if (settings.historyEnabled) historyWriter.schedule(history);
    }, [history, settings.historyEnabled]);

    useEffect(() => {
        if (settings.historyEnabled) return;

        historyWriter.cancel();

        if (history.length > 0) {
            setHistory([]);
        }

        localStorage.removeItem(HISTORY_STORAGE_KEY);
    }, [settings.historyEnabled, history]);

    useEffect(() => {
        settingsWriter.schedule(settings);
    }, [settings]);

    // Sync notification settings to main process
    useEffect(() => {
        if (window.electronAPI?.updateNotificationSettings) {
            window.electronAPI.updateNotificationSettings(settings.enableNotifications);
        }
    }, [settings.enableNotifications]);

    // Add completed download to history
    const addToHistory = useCallback((item: DownloadItem) => {
        if (!settings.historyEnabled) return;

        // One entry per media item, so re-downloading updates it. The key is the
        // video id or the cleaned URL; a truncated URL prefix made every YouTube
        // link share one entry.
        const historyId = getMetadataCacheKey(item.url);

        const historyItem: HistoryItem = {
            id: historyId,
            title: item.title,
            url: item.url,
            thumbnail: item.thumbnail,
            format: item.format || 'video',
            quality: item.quality,
            filePath: item.filePath,
            fileName: item.fileName,
            fileSize: item.fileSize,
            fileExt: item.fileExt,
            fileCount: item.fileCount,
            totalBytes: item.totalBytes,
            completedAt: new Date().toISOString(),
        };
        // Remove existing entry with same ID before adding new one (update)
        setHistory(prev => {
            const filtered = prev.filter(h => h.id !== historyId);
            return [historyItem, ...filtered].slice(0, 100); // Keep max 100 items
        });
    }, [settings.historyEnabled]);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onDownloadProgress || !api.onDownloadComplete || !api.onDownloadError) return;

        const flushProgress = () => {
            const consumedIds = new Set<string>();
            const now = Date.now();

            setDownloads(prev => prev.map(d => {
                const update = progressQueue.current.get(d.id);
                if (!update) return d;
                consumedIds.add(d.id);

                // Ignore late progress packets after completion to prevent
                // accidental UI regression back to "downloading".
                if (d.status === 'completed') {
                    return d;
                }

                return { ...d, progress: update.progress, speed: update.speed, speedBps: update.speedBps, eta: update.eta, status: 'downloading' };
            }));

            consumedIds.forEach((id) => progressQueue.current.delete(id));

            // Drop stale unmatched packets after 30s to avoid unbounded growth.
            for (const [id, update] of progressQueue.current.entries()) {
                if (now - update.queuedAt > 30000) {
                    progressQueue.current.delete(id);
                }
            }

            if (progressQueue.current.size > 0) {
                progressTimer.current = setTimeout(flushProgress, PROGRESS_FLUSH_MS);
            } else {
                progressTimer.current = null;
            }
        };

        const handleProgress = ({ id, progress, speed, speedBps, eta }: { id: string; progress: number; speed?: string; speedBps?: number; eta?: string }) => {
            progressQueue.current.set(id, { progress, speed, speedBps, eta, queuedAt: Date.now() });
            if (!progressTimer.current) {
                progressTimer.current = setTimeout(flushProgress, PROGRESS_FLUSH_MS);
            }
        };

        const handleComplete = ({ id, filePath, fileName, fileSize, fileExt, fileCount, totalBytes }: { id: string; filePath?: string; fileName?: string; fileSize?: number; fileExt?: string; fileCount?: number; totalBytes?: number }) => {
            // Drop queued progress so a late flush cannot overwrite the final state.
            progressQueue.current.delete(id);
            setDownloads(prev => trimCompletedDownloads(prev.map(d => {
                if (d.id !== id) return d;
                const completedItem = {
                    ...d,
                    status: 'completed' as const,
                    progress: 100,
                    speed: undefined,
                    speedBps: undefined,
                    eta: undefined,
                    filePath,
                    fileName,
                    fileSize,
                    fileExt,
                    fileCount,
                    totalBytes,
                    completedAt: new Date().toISOString(),
                };
                addToHistory(completedItem);
                return completedItem;
            })));
        };

        const handleError = ({ id, error }: { id: string; error: string }) => {
            console.error("Download error:", error);
            setDownloads(prev => prev.map(d => (
                d.id === id ? { ...d, status: 'error' as const, error, speedBps: undefined } : d
            )));
        };

        const unsubscribeProgress = api.onDownloadProgress(handleProgress);
        const unsubscribeComplete = api.onDownloadComplete(handleComplete);
        const unsubscribeError = api.onDownloadError(handleError);

        return () => {
            unsubscribeProgress();
            unsubscribeComplete();
            unsubscribeError();
        };
    }, [addToHistory]);

    const getVideoInfo = useCallback(async (url: string) => {
        const now = Date.now();
        const cacheKey = `${settings.cookiesFromBrowser || 'public'}:${getMetadataCacheKey(url)}`;
        const cached = videoInfoCache.current.get(cacheKey);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
            return { success: true, data: cached.data } as const;
        }

        const inflight = videoInfoInflight.current.get(cacheKey);
        if (inflight) return inflight;

        const request = (async () => {
            try {
                let result;
                if (window.electronAPI?.getVideoInfo) {
                    result = await window.electronAPI.getVideoInfo(url, settings.cookiesFromBrowser || undefined);
                } else {
                    result = {
                        success: true,
                        data: {
                            id: 'mock-id',
                            title: 'Mock Video Title',
                            thumbnail: 'https://via.placeholder.com/320x180',
                            duration: 245,
                            uploader: 'Mock Channel',
                            view_count: 12345,
                            videoQualities: [1080, 720, 480],
                            videoQualitySizes: {
                                '1080': 220000000,
                                '720': 130000000,
                                '480': 70000000,
                            },
                        }
                    };
                }

                if (result.success && result.data) {
                    videoInfoCache.current.set(cacheKey, { data: result.data, timestamp: Date.now() });
                }
                return result;
            } finally {
                // Always clear in-flight marker, including rejected requests.
                videoInfoInflight.current.delete(cacheKey);
            }
        })();

        videoInfoInflight.current.set(cacheKey, request);
        return request;
    }, [settings.cookiesFromBrowser]);

    const getFastVideoInfo = useCallback(async (url: string) => {
        const cacheKey = getMetadataCacheKey(url);
        const now = Date.now();
        const cached = quickVideoInfoCache.current.get(cacheKey);
        if (cached && now - cached.timestamp < QUICK_CACHE_TTL_MS) {
            return { success: true, data: cached.data } as const;
        }

        const inflight = quickVideoInfoInflight.current.get(cacheKey);
        if (inflight) return inflight;

        const request = (async () => {
            try {
                let result;
                if (window.electronAPI?.getVideoInfoFast) {
                    result = await window.electronAPI.getVideoInfoFast(url);
                } else {
                    result = await getVideoInfo(url);
                }

                if (result.success && result.data) {
                    quickVideoInfoCache.current.set(cacheKey, { data: result.data, timestamp: Date.now() });
                }
                return result;
            } finally {
                quickVideoInfoInflight.current.delete(cacheKey);
            }
        })();

        quickVideoInfoInflight.current.set(cacheKey, request);
        return request;
    }, [getVideoInfo]);

    const addDownload = useCallback(async (
        url: string,
        format: DownloadFormat = 'video',
        quality?: string,
        outputDirOrOptions?: string | AddDownloadOptions
    ) => {
        const parsedOptions: AddDownloadOptions = typeof outputDirOrOptions === 'string'
            ? { outputDir: outputDirOrOptions }
            : (outputDirOrOptions || {});

        const turboEnabled = parsedOptions.turboOverride?.enabled ?? settings.enableTurboDownload;
        const adaptiveTurbo = parsedOptions.turboOverride?.adaptive ?? settings.adaptiveTurboDownload;
        const turboConnections = parsedOptions.turboOverride?.connections ?? settings.turboConnections;

        let title = parsedOptions.title;
        let thumbnail = parsedOptions.thumbnail;
        if (!title) {
            const infoResult = await getVideoInfo(url).catch(() => null);
            const info = infoResult?.success ? infoResult.data : undefined;
            title = info?.title;
            thumbnail = thumbnail ?? info?.thumbnail;
        }

        const audioFormat = format === 'audio' ? (parsedOptions.audioFormat ?? 'mp3') : undefined;
        const expectedBytes = parsedOptions.expectedBytes && parsedOptions.expectedBytes > 0
            ? parsedOptions.expectedBytes
            : undefined;

        // Keep downloader input as the original page URL.
        // Main process fallback logic performs generic direct-media extraction and validation.
        const downloadOptions = {
            id: Math.random().toString(36).substr(2, 9),
            url,
            titleOverride: title,
            format,
            quality,
            photoTimestampMode: parsedOptions.photoTimestampMode,
            audioFormat,
            expectedBytes,
            galleryIndices: parsedOptions.galleryIndices,
            directUrls: parsedOptions.directUrls,
            cookiesFromBrowser: settings.cookiesFromBrowser,
            embedSubtitles: settings.embedSubtitles,
            subtitleLanguages: settings.subtitleLanguages,
            embedMetadata: settings.embedMetadata,
            preserveThumbnail: settings.preserveThumbnail,
            embedAltAudio: settings.embedAltAudio,
            preferredAudioLang: settings.preferredAudioLang,
            enableTurboDownload: turboEnabled,
            adaptiveTurboDownload: adaptiveTurbo,
            turboConnections,
            outputDir: parsedOptions.outputDir,
            fileNameTemplate: settings.fileNameTemplate,
        };
        launchOptions.current.set(downloadOptions.id, downloadOptions);

        const queuedItem: DownloadItem = {
            id: downloadOptions.id,
            url,
            title: title || PLACEHOLDER_TITLE,
            thumbnail,
            progress: 0,
            status: 'queued',
            format,
            quality,
            outputDir: parsedOptions.outputDir,
            enableTurboDownload: turboEnabled,
            adaptiveTurboDownload: adaptiveTurbo,
            turboConnections,
            photoTimestampMode: parsedOptions.photoTimestampMode,
            audioFormat,
            expectedBytes,
            galleryIndices: parsedOptions.galleryIndices,
            directUrls: parsedOptions.directUrls,
            fileNameTemplate: settings.fileNameTemplate,
        };

        // The scheduler below starts it as soon as a slot is free.
        setDownloads(prev => [queuedItem, ...prev]);
    }, [getVideoInfo, settings]);

    const launchDownload = useCallback(async (download: DownloadItem) => {
        let options = launchOptions.current.get(download.id);
        launchOptions.current.delete(download.id);

        try {
            // A paused item that went back into the queue: prefer the options the
            // main process kept, which include any resolved source.
            if (!options && window.electronAPI?.resumeDownload) {
                const paused = await window.electronAPI.resumeDownload(download.id).catch(() => null);
                if (paused?.success && paused.options) options = { ...paused.options, id: download.id };
            }
            options = options ?? buildRestartOptions(download, settings);

            if (!window.electronAPI?.startDownload) {
                console.warn('IPC not available, mocking download');
                let progress = 0;
                const interval = setInterval(() => {
                    progress += Math.random() * 15;
                    if (progress >= 100) {
                        clearInterval(interval);
                        setDownloads(prev => prev.map(d => {
                            if (d.id !== download.id) return d;
                            const completed = { ...d, status: 'completed' as const, progress: 100 };
                            addToHistory(completed);
                            return completed;
                        }));
                    } else {
                        setDownloads(prev => prev.map(d =>
                            d.id === download.id ? { ...d, status: 'downloading', progress, speed: '1.5 MB/s', speedBps: 1572864, eta: '00:15' } : d
                        ));
                    }
                }, 500);
                return;
            }

            const result = await window.electronAPI.startDownload(options);

            // Photos return 'completed', and early pause/cancel return 'paused'/'canceled'.
            // An 'error' with no message has already been reported by the main process.
            if (!result || (result.status === 'error' && result.error)) {
                throw new Error(result?.error || 'Download did not start');
            }

            if (result?.id && result.id !== download.id) {
                setDownloads(prev => prev.map(d => d.id === download.id ? { ...d, id: result.id } : d));
            }
        } catch (e) {
            console.error('Failed to start download', e);
            const message = e instanceof Error ? e.message : 'Failed to start download';
            setDownloads(prev => prev.map(d =>
                d.id === download.id && d.status !== 'completed'
                    ? { ...d, status: 'error', error: message }
                    : d
            ));
        } finally {
            launchingIds.current.delete(download.id);
        }
    }, [settings, addToHistory]);

    // Starts queued items, oldest first, while fewer than the limit are running.
    useEffect(() => {
        const startIds = pickQueuedToStart(downloads, settings.maxParallelDownloads || DEFAULT_MAX_PARALLEL_DOWNLOADS)
            .filter(id => !launchingIds.current.has(id));
        if (startIds.length === 0) return;

        const starting = downloads.filter(d => startIds.includes(d.id));
        starting.forEach(d => launchingIds.current.add(d.id));
        setDownloads(prev => prev.map(d => (
            startIds.includes(d.id) && d.status === 'queued' ? { ...d, status: 'pending' as const } : d
        )));
        starting.forEach(d => { void launchDownload(d); });
    }, [downloads, settings.maxParallelDownloads, launchDownload]);

    const removeDownload = useCallback((id: string) => {
        launchOptions.current.delete(id);
        setDownloads(prev => prev.filter(d => d.id !== id));
    }, []);

    const cancelDownload = useCallback(async (id: string) => {
        try {
            // A queued item has no process yet.
            if (downloads.find(d => d.id === id)?.status === 'queued') {
                removeDownload(id);
                return;
            }

            let result: any = { success: false };
            if (window.electronAPI?.cancelDownload) {
                result = await window.electronAPI.cancelDownload(id);
            } else {
                result = { success: true };
            }

            if (!result?.success) {
                throw new Error(result?.error || 'Cancel request was not accepted');
            }

            removeDownload(id);
        } catch (e) {
            console.error('Failed to cancel download', e);
            throw e;
        }
    }, [downloads, removeDownload]);

    const pauseDownload = useCallback(async (id: string) => {
        try {
            const queued = downloads.find(d => d.id === id)?.status === 'queued';
            let result: any = { success: queued };
            if (!queued && window.electronAPI?.pauseDownload) {
                result = await window.electronAPI.pauseDownload(id);
            } else if (!queued) {
                result = { success: true };
            }

            if (!result?.success) {
                throw new Error(result?.error || 'Pause request was not accepted');
            }

            // Update status to paused
            setDownloads(prev => prev.map(d =>
                d.id === id ? { ...d, status: 'paused' as const, speed: undefined, speedBps: undefined } : d
            ));
        } catch (e) {
            console.error('Failed to pause download', e);
            throw e;
        }
    }, [downloads]);

    const resumeDownload = useCallback(async (id: string) => {
        try {
            // Get the paused download info
            const download = downloads.find(d => d.id === id);
            if (!download) return;

            // Paused before it ever started: back into the queue.
            if (launchOptions.current.has(id)) {
                setDownloads(prev => prev.map(d =>
                    d.id === id ? { ...d, status: 'queued' as const } : d
                ));
                return;
            }

            // Resume will restart the download with the same URL
            // yt-dlp automatically resumes from partial files
            let resumed = false;
            if (window.electronAPI?.resumeDownload) {
                const result = await window.electronAPI.resumeDownload(id);
                if (result.success && result.options) {
                    // Restart the download
                    await window.electronAPI.startDownload({
                        ...result.options,
                        id // Keep same ID
                    });
                    resumed = true;
                }
            }

            // Fallback: if main process lost paused state (e.g. app restart),
            // restart using the same id so yt-dlp can continue partial files.
            if (!resumed && window.electronAPI?.startDownload) {
                await window.electronAPI.startDownload(buildRestartOptions(download, settings));
                resumed = true;
            }

            if (!resumed) {
                throw new Error('Unable to resume download');
            }

            // Update status to downloading
            setDownloads(prev => prev.map(d =>
                d.id === id ? { ...d, status: 'downloading' as const, error: undefined } : d
            ));
        } catch (e) {
            console.error('Failed to resume download', e);
            throw e;
        }
    }, [downloads, settings]);

    const cancelAllDownloads = useCallback(async () => {
        const cancellableIds = downloads
            .filter(d => d.status === 'queued' || d.status === 'pending' || d.status === 'downloading' || d.status === 'paused')
            .map(d => d.id);

        if (cancellableIds.length === 0) return;

        const results = await Promise.allSettled(cancellableIds.map(id => cancelDownload(id)));
        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length > 0) {
            throw new Error(`Failed to cancel ${failures.length} download(s)`);
        }
    }, [downloads, cancelDownload]);

    const stopAllDownloads = useCallback(async () => {
        // Queued items pause too, or they would take the slots this frees.
        const pausableIds = downloads
            .filter(d => d.status === 'queued' || d.status === 'downloading')
            .map(d => d.id);

        if (pausableIds.length === 0) return;

        const results = await Promise.allSettled(pausableIds.map(id => pauseDownload(id)));
        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length > 0) {
            throw new Error(`Failed to stop ${failures.length} download(s)`);
        }
    }, [downloads, pauseDownload]);

    // Back into the queue, so the parallel limit still applies.
    const resumeAllDownloads = useCallback(async () => {
        setDownloads(prev => prev.map(d => (
            d.status === 'paused' ? { ...d, status: 'queued' as const, error: undefined } : d
        )));
    }, []);

    const findInHistory = useCallback((url: string) => findHistoryMatch(history, url), [history]);

    const boostDownload = useCallback(async (id: string) => {
        const download = downloads.find(d => d.id === id);
        if (!download) return;

        // Use a conservative boost floor that is faster but still stable for most hosts.
        const boostedConnections = Math.max(download.turboConnections || settings.turboConnections || 8, 12);

        try {
            if (window.electronAPI?.pauseDownload) {
                await window.electronAPI.pauseDownload(id);
            }

            if (window.electronAPI?.startDownload) {
                // Reuse the options the main process kept, including any resolved source.
                const paused = await window.electronAPI.resumeDownload?.(id);
                await window.electronAPI.startDownload({
                    ...(paused?.options ?? buildRestartOptions(download, settings)),
                    id,
                    enableTurboDownload: true,
                    adaptiveTurboDownload: false,
                    turboConnections: boostedConnections,
                });
            }

            setDownloads(prev => prev.map(d =>
                d.id === id
                    ? {
                        ...d,
                        status: 'downloading' as const,
                        enableTurboDownload: true,
                        adaptiveTurboDownload: false,
                        turboConnections: boostedConnections,
                        eta: 'boosting...',
                    }
                    : d
            ));
        } catch (e) {
            console.error('Failed to boost download', e);
            throw e;
        }
    }, [downloads, settings]);

    const retryDownload = useCallback(async (id: string) => {
        const download = downloads.find(d => d.id === id);
        if (!download) return;

        // Try resume path first to reuse partial files.
        try {
            await resumeDownload(id);
            return;
        } catch {
            // Fallback for environments without resume support.
        }

        removeDownload(id);
        await addDownload(download.url, download.format, download.quality, {
            title: download.title === PLACEHOLDER_TITLE ? undefined : download.title,
            thumbnail: download.thumbnail,
            audioFormat: download.audioFormat,
            expectedBytes: download.expectedBytes,
            outputDir: download.outputDir,
            turboOverride: {
                enabled: download.enableTurboDownload ?? settings.enableTurboDownload,
                adaptive: download.adaptiveTurboDownload ?? settings.adaptiveTurboDownload,
                connections: download.turboConnections ?? settings.turboConnections,
            },
            photoTimestampMode: download.photoTimestampMode,
        });
    }, [downloads, resumeDownload, removeDownload, addDownload, settings]);

    const clearCompleted = useCallback(() => {
        setDownloads(prev => prev.filter(d => d.status !== 'completed' && d.status !== 'error'));
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        setDownloads(prev => removeAllTerminalDownloads(prev));
        localStorage.removeItem(HISTORY_STORAGE_KEY);
    }, []);

    const removeFromHistory = useCallback((id: string) => {
        const removedItem = history.find(item => item.id === id);
        setHistory(prev => prev.filter(h => h.id !== id));
        if (removedItem) {
            setDownloads(prev => removeRelatedTerminalDownloads(prev, removedItem.url));
        }
    }, [history]);

    const updateSettings = useCallback((newSettings: Partial<DownloadSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    }, []);

    const searchVideos = useCallback(async (query: string, platform: string, count: number = 20) => {
        if (window.electronAPI?.searchVideos) {
            return await window.electronAPI.searchVideos(query, platform, count, settings.cookiesFromBrowser || undefined);
        }
        // Mock for browser testing
        return {
            success: true,
            data: {
                query,
                platform,
                results: []
            }
        };
    }, [settings.cookiesFromBrowser]);

    const getPlaylistInfo = useCallback(async (url: string) => {
        if (window.electronAPI?.getPlaylistInfo) {
            return await window.electronAPI.getPlaylistInfo(url);
        }
        // Mock for browser testing
        return {
            success: false,
            error: 'Playlist info not available in browser mode'
        };
    }, []);

    const getAvailableBrowsers = useCallback(async () => {
        if (window.electronAPI?.getAvailableBrowsers) {
            return await window.electronAPI.getAvailableBrowsers();
        }
        // Mock for browser testing
        return {
            success: true,
            browsers: [
                { id: 'chrome', name: 'Google Chrome' },
                { id: 'firefox', name: 'Mozilla Firefox' },
                { id: 'edge', name: 'Microsoft Edge' },
            ]
        };
    }, []);

    const validateBrowserCookies = useCallback(async (browser: string) => {
        if (window.electronAPI?.validateBrowserCookies) {
            return await window.electronAPI.validateBrowserCookies(browser);
        }
        // Mock for browser testing
        return {
            success: false,
            status: 'unknown',
            isValid: false,
            browser,
            message: 'Cannot validate cookies in browser mode'
        };
    }, []);

    const value = useMemo<DownloadContextType>(() => ({
        findInHistory,
        downloads,
        history,
        settings,
        addDownload,
        removeDownload,
        cancelDownload,
        pauseDownload,
        resumeDownload,
        cancelAllDownloads,
        stopAllDownloads,
        resumeAllDownloads,
        boostDownload,
        retryDownload,
        clearCompleted,
        clearHistory,
        removeFromHistory,
        updateSettings,
        getVideoInfo,
        getFastVideoInfo,
        searchVideos,
        getPlaylistInfo,
        getAvailableBrowsers,
        validateBrowserCookies,
    }), [
        findInHistory,
        downloads,
        history,
        settings,
        addDownload,
        removeDownload,
        cancelDownload,
        pauseDownload,
        resumeDownload,
        cancelAllDownloads,
        stopAllDownloads,
        resumeAllDownloads,
        boostDownload,
        retryDownload,
        clearCompleted,
        clearHistory,
        removeFromHistory,
        updateSettings,
        getVideoInfo,
        getFastVideoInfo,
        searchVideos,
        getPlaylistInfo,
        getAvailableBrowsers,
        validateBrowserCookies,
    ]);

    return (
        <DownloadContext.Provider value={value}>
            {children}
        </DownloadContext.Provider>
    );
};

export const useDownloads = () => {
    const context = useContext(DownloadContext);
    if (context === undefined) {
        throw new Error('useDownloads must be used within a DownloadProvider');
    }
    return context;
};
