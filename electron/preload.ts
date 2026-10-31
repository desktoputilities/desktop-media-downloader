import { ipcRenderer, contextBridge } from 'electron'

type DownloadEventListener<T> = (payload: T) => void

const subscribe = <T>(channel: string, listener: DownloadEventListener<T>) => {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  onDownloadProgress: (listener: DownloadEventListener<{ id: string; progress: number; speed?: string; eta?: string; speedBps?: number }>) =>
    subscribe('download-progress', listener),
  onDownloadComplete: (listener: DownloadEventListener<{ id: string; filePath?: string; fileName?: string; fileSize?: number; fileExt?: string; fileCount?: number; totalBytes?: number }>) =>
    subscribe('download-complete', listener),
  onDownloadError: (listener: DownloadEventListener<{ id: string; error: string }>) =>
    subscribe('download-error', listener),

  getVideoInfo: (url: string, cookiesBrowser?: string) => ipcRenderer.invoke('get-video-info', url, cookiesBrowser),
  getVideoInfoFast: (url: string) => ipcRenderer.invoke('get-video-info-fast', url),
  startDownload: (options: any) => ipcRenderer.invoke('start-download', options),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id: string) => ipcRenderer.invoke('resume-download', id),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  openFolder: (folderPath?: string) => ipcRenderer.invoke('open-folder', folderPath),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  showFile: (filePath: string) => ipcRenderer.invoke('show-file', filePath),
  getDownloadLocation: () => ipcRenderer.invoke('get-download-location'),
  selectDownloadLocation: () => ipcRenderer.invoke('select-download-location'),
  pickDownloadLocationOnce: (initialPath?: string) => ipcRenderer.invoke('pick-download-location-once', initialPath),
  resetDownloadLocation: () => ipcRenderer.invoke('reset-download-location'),

  // Playlist/Channel functions
  getPlaylistInfo: (url: string) => ipcRenderer.invoke('get-playlist-info', url),

  // Search functions
  searchVideos: (query: string, platform: string, count: number, cookiesBrowser?: string) =>
    ipcRenderer.invoke('search-videos', query, platform, count, cookiesBrowser),

  // Browser cookie functions (for authentication)
  getAvailableBrowsers: () => ipcRenderer.invoke('get-available-browsers'),
  validateBrowserCookies: (browser: string) => ipcRenderer.invoke('validate-browser-cookies', browser),

  // Cookies imported from browser profiles, per site
  clearSiteLogin: (site?: string) => ipcRenderer.invoke('site-login-clear', site),
  // Without content, opens a file picker for a cookies.txt or JSON export.
  importSiteCookies: (content?: string) => ipcRenderer.invoke('site-cookies-import', content),
  listSiteLogins: () => ipcRenderer.invoke('site-login-list'),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppUpdateState: () => ipcRenderer.invoke('get-app-update-state'),
  downloadAppUpdate: () => ipcRenderer.invoke('download-app-update'),
  installAppUpdate: () => ipcRenderer.invoke('install-app-update'),
  onAppUpdateState: (listener: DownloadEventListener<unknown>) => subscribe('app-update-state', listener),

  // Setup wizard helpers
  getRuntimeDependenciesStatus: () => ipcRenderer.invoke('get-runtime-dependencies-status'),
  getEngineStatus: () => ipcRenderer.invoke('get-engine-status'),
  updateEngines: () => ipcRenderer.invoke('update-engines'),
  setEngineAutoUpdate: (enabled: boolean) => ipcRenderer.invoke('set-engine-auto-update', enabled),
  onEnginesUpdated: (listener: DownloadEventListener<unknown>) => subscribe('engines-updated', listener),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),

  // Notification settings
  updateNotificationSettings: (enabled: boolean) => ipcRenderer.invoke('update-notification-settings', enabled),
})
