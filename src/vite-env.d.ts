/// <reference types="vite/client" />

interface EngineStatus {
    autoUpdate: boolean;
    lastCheckedAt: number | null;
    updating: boolean;
    engines: Array<{
        id: 'yt-dlp' | 'gallery-dl';
        version: string | null;
        source: 'updated' | 'bundled' | 'system' | null;
        updatable: boolean;
    }>;
}

interface Window {
    electronAPI?: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        onDownloadProgress: (listener: (payload: { id: string; progress: number; speed?: string; eta?: string; speedBps?: number }) => void) => () => void;
        onDownloadComplete: (listener: (payload: { id: string; filePath?: string; fileName?: string; fileSize?: number; fileExt?: string; fileCount?: number; totalBytes?: number }) => void) => () => void;
        onDownloadError: (listener: (payload: { id: string; error: string }) => void) => () => void;
        getVideoInfo: (url: string, cookiesBrowser?: string) => Promise<any>;
        getVideoInfoFast: (url: string) => Promise<any>;
        startDownload: (options: any) => Promise<any>;
        cancelDownload: (id: string) => Promise<any>;
        pauseDownload: (id: string) => Promise<any>;
        resumeDownload: (id: string) => Promise<any>;
        openDownloadsFolder: () => Promise<any>;
        openFolder: (folderPath?: string) => Promise<any>;
        openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        showFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        getDownloadLocation: () => Promise<{
            success: boolean;
            data?: {
                path: string;
                defaultPath: string;
                isDefault: boolean;
            };
        }>;
        selectDownloadLocation: () => Promise<{
            success: boolean;
            canceled?: boolean;
            data?: {
                path: string;
                defaultPath: string;
                isDefault: boolean;
            };
        }>;
        pickDownloadLocationOnce: (initialPath?: string) => Promise<{
            success: boolean;
            canceled?: boolean;
            data?: {
                path: string;
            };
        }>;
        resetDownloadLocation: () => Promise<{
            success: boolean;
            data?: {
                path: string;
                defaultPath: string;
                isDefault: boolean;
            };
        }>;
        // Playlist/Channel functions
        getPlaylistInfo: (url: string) => Promise<any>;
        // Search functions
        searchVideos: (query: string, platform: string, count: number, cookiesBrowser?: string) => Promise<any>;
        // Browser cookie functions
        getAvailableBrowsers: () => Promise<any>;
        validateBrowserCookies: (browser: string) => Promise<{
            success: boolean;
            status: 'valid' | 'invalid' | 'unknown';
            isValid: boolean;
            browser: string;
            message: string;
        }>;
        // Imported site cookies
        clearSiteLogin: (site?: string) => Promise<{ success: boolean }>;
        importSiteCookies: (content?: string) => Promise<{ success: boolean; canceled?: boolean; imported?: number; sites?: string[]; error?: string }>;
        listSiteLogins: () => Promise<{ sites: string[] }>;
        // App info
        getAppInfo: () => Promise<{
            success: boolean;
            data?: {
                version: string;
                electron: string;
                node: string;
            };
        }>;
        checkForUpdates: () => Promise<{
            success: boolean;
            data?: {
                currentVersion: string;
                latestVersion: string;
                updateAvailable: boolean;
                releaseUrl: string;
                publishedAt: string | null;
            };
            error?: string;
        }>;
        getRuntimeDependenciesStatus: () => Promise<{
            success: boolean;
            data?: {
                platform: 'windows' | 'macos' | 'linux';
                dependencies: Array<{
                    id: string;
                    name: string;
                    required: boolean;
                    installed: boolean;
                    installCommand: string;
                    helpUrl: string;
                }>;
            };
        }>;
        getEngineStatus: () => Promise<EngineStatus>;
        updateEngines: () => Promise<{
            results: Array<
                | { engine: string; status: 'updated'; from: string | null; to: string }
                | { engine: string; status: 'current'; version: string | null }
                | { engine: string; status: 'unavailable' }
                | { engine: string; status: 'error'; error: string }
            >;
            status: EngineStatus;
        }>;
        setEngineAutoUpdate: (enabled: boolean) => Promise<EngineStatus>;
        onEnginesUpdated: (listener: (status: EngineStatus) => void) => () => void;
        openExternalUrl: (url: string) => Promise<{
            success: boolean;
            error?: string;
        }>;
        // Notification settings
        updateNotificationSettings: (enabled: boolean) => Promise<{
            success: boolean;
        }>;
    };
}
