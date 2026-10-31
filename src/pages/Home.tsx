import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDownloads, VideoInfo } from '../context/DownloadContext';
import {
    Pause,
    Play,
    X,
    Clipboard,
    Search,
    ListVideo,
    Zap,
    ArrowRight,
    Lock,
    LogIn,
    Loader2,
    AlertTriangle,
    RotateCw,
    Upload,
} from 'lucide-react';
import DownloadCard from '../components/DownloadCard';
import FormatPanel, { type FormatPanelHandle, type FormatSelection } from '../components/FormatSelector';
import UrlPreview from '../components/UrlPreview';
import SearchModal from '../components/SearchModal';
import PlaylistModal from '../components/PlaylistModal';
import { cn, formatFileSize } from '../lib/utils';
import { openFolder } from '../lib/fileActions';
import { createImmediateVideoPreview, getUrlTimestampSeconds, isCompleteMediaUrl } from '../lib/videoPreview';
import { motion, AnimatePresence } from 'framer-motion';

const RECENT_LIMIT = 3;

export interface IncomingLink {
    url: string;
    // Changes on every paste or drop, so the same link can be sent twice.
    nonce: number;
}

interface HomeProps {
    incomingLink?: IncomingLink | null;
    onNavigate?: (page: string) => void;
}

const isDirectPlaylistUrl = (urlStr: string): boolean => {
    if (!urlStr) return false;

    try {
        const parsed = new URL(urlStr);
        const host = parsed.hostname.toLowerCase();
        const isYouTubeHost = host.includes('youtube.com') || host.includes('youtu.be');
        if (!isYouTubeHost) return false;

        // Treat canonical playlist links as direct playlist mode.
        return parsed.pathname.includes('/playlist') && parsed.searchParams.has('list');
    } catch {
        return false;
    }
};

// Check if URL has playlist context (either direct playlist or video-with-list)
const checkIfPlaylist = (urlStr: string): boolean => {
    if (!urlStr) return false;

    try {
        const parsed = new URL(urlStr);
        const hasList = parsed.searchParams.has('list');
        return hasList ||
            parsed.pathname.includes('/playlist') ||
            urlStr.includes('/playlist/') ||
            (urlStr.includes('@') && urlStr.includes('/videos')) ||
            urlStr.includes('/channel/') ||
            urlStr.includes('/c/');
    } catch {
        return urlStr.includes('list=') ||
            urlStr.includes('playlist?list=') ||
            urlStr.includes('/playlist/');
    }
};

const Home: React.FC<HomeProps> = ({ incomingLink, onNavigate }) => {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
    const [isLoadingInfo, setIsLoadingInfo] = useState(false);
    const [isEnrichingInfo, setIsEnrichingInfo] = useState(false);
    const [infoError, setInfoError] = useState<string | undefined>();
    const [isPlaylistUrl, setIsPlaylistUrl] = useState(false);
    const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
    // Why the full fetch failed, shown under the preview; 'login' offers sign-in.
    const [fetchProblem, setFetchProblem] = useState<{ kind: string; site?: string; message?: string } | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const panelRef = useRef<FormatPanelHandle>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const {
        addDownload,
        downloads,
        cancelDownload,
        pauseDownload,
        resumeDownload,
        cancelAllDownloads,
        stopAllDownloads,
        resumeAllDownloads,
        boostDownload,
        retryDownload,
        getVideoInfo,
        getFastVideoInfo,
        findInHistory,
        settings,
    } = useDownloads();

    const isMediaUrl = isCompleteMediaUrl(url);
    const timestampSeconds = useMemo(() => getUrlTimestampSeconds(url), [url]);
    const duplicate = useMemo(() => (isMediaUrl ? findInHistory(url) : undefined), [isMediaUrl, url, findInHistory]);

    // Smart Clipboard Detection
    useEffect(() => {
        const checkClipboard = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && (text.includes('http://') || text.includes('https://'))) {
                    if (text !== url && text !== clipboardUrl) {
                        setClipboardUrl(text);
                    }
                }
            } catch (e) {
                // Ignore clipboard errors
            }
        };

        window.addEventListener('focus', checkClipboard);
        checkClipboard(); // Initial check

        return () => window.removeEventListener('focus', checkClipboard);
    }, [url, clipboardUrl]);

    // Fetch video info when URL is pasted
    const handleUrlChange = useCallback((newUrl: string) => {
        setUrl(newUrl);
        setVideoInfo(null);
        setInfoError(undefined);
        setIsPlaylistUrl(checkIfPlaylist(newUrl));
        setClipboardUrl(null);

        if (isDirectPlaylistUrl(newUrl)) {
            setShowPlaylistModal(true);
        }
    }, []);

    // A link pasted or dropped anywhere in the window.
    useEffect(() => {
        if (!incomingLink) return;
        handleUrlChange(incomingLink.url);
        inputRef.current?.focus();
    }, [incomingLink, handleUrlChange]);

    // Debounced info fetch to avoid spamming IPC while typing
    useEffect(() => {
        if (!url || !isCompleteMediaUrl(url) || isDirectPlaylistUrl(url)) {
            // Playlist links open the playlist flow instead of video-info probing.
            setIsLoadingInfo(false);
            setIsEnrichingInfo(false);
            setInfoError(undefined);
            setVideoInfo(null);
            return;
        }

        let cancelled = false;
        let completeInfoReceived = false;
        let hasQuickPreview = true;
        setVideoInfo(createImmediateVideoPreview(url));
        setInfoError(undefined);
        setFetchProblem(null);
        setIsLoadingInfo(false);
        setIsEnrichingInfo(true);

        const timer = setTimeout(() => {
            // Start both requests together: the fast path paints the card first,
            // while yt-dlp continues resolving formats and precise media details.
            void getFastVideoInfo(url).then((result) => {
                if (cancelled || completeInfoReceived) return;
                if (result.success && result.data) {
                    hasQuickPreview = true;
                    setVideoInfo(result.data);
                    setInfoError(undefined);
                    setIsLoadingInfo(false);
                }
            }).catch(() => {
                // The detailed request remains authoritative and may still succeed.
            });

            void getVideoInfo(url).then((result) => {
                if (cancelled) return;
                if (result.success && result.data) {
                    completeInfoReceived = true;
                    setVideoInfo(result.data);
                    setInfoError(undefined);
                    return;
                }
                setFetchProblem({ kind: result.errorKind || 'other', site: result.site, message: result.error });
                if (!hasQuickPreview) {
                    setInfoError(result.error || 'Could not fetch video info');
                    setVideoInfo(null);
                }
            }).catch((error) => {
                if (!cancelled && !hasQuickPreview) {
                    console.error('Error fetching video info:', error);
                    setInfoError('Failed to fetch video information');
                    setVideoInfo(null);
                }
            }).finally(() => {
                if (!cancelled) {
                    setIsLoadingInfo(false);
                    setIsEnrichingInfo(false);
                }
            });
        }, 80);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [url, getFastVideoInfo, getVideoInfo, reloadKey]);

    // Cookies exported from the browser profile signed in to the site.
    const handleImportCookies = async () => {
        if (!window.electronAPI?.importSiteCookies) return;
        setIsSigningIn(true);
        try {
            const result = await window.electronAPI.importSiteCookies();
            if (result.success) setReloadKey((key) => key + 1);
        } finally {
            setIsSigningIn(false);
        }
    };

    // Sign in inside the app, then fetch the link again with those cookies.
    const handleSiteSignIn = async (site: string) => {
        if (!window.electronAPI?.openSiteLogin) return;
        setIsSigningIn(true);
        try {
            const result = await window.electronAPI.openSiteLogin(site);
            if (result.success && result.signedIn) setReloadKey((key) => key + 1);
        } finally {
            setIsSigningIn(false);
        }
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text && (text.includes('http://') || text.includes('https://'))) {
                handleUrlChange(text.trim());
            }
        } catch (e) {
            console.error('Failed to read clipboard', e);
        }
    };

    const resetLink = () => {
        setUrl('');
        setVideoInfo(null);
        setInfoError(undefined);
        setFetchProblem(null);
        setIsPlaylistUrl(false);
    };

    // Only full metadata names the file; the instant preview's title is a guess.
    const knownMetadata = () => (videoInfo && !videoInfo.isPartial
        ? { title: videoInfo.title, thumbnail: videoInfo.thumbnail || undefined }
        : { thumbnail: videoInfo?.thumbnail || undefined });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!url) return;

        if (isDirectPlaylistUrl(url)) {
            setShowPlaylistModal(true);
            return;
        }

        panelRef.current?.submit();
    };

    const handleFormatDownload = (selection: FormatSelection) => {
        void addDownload(url, selection.format, selection.quality, {
            ...knownMetadata(),
            outputDir: selection.outputDir,
            turboOverride: selection.turboOverride,
            photoTimestampMode: selection.photoTimestampMode,
            audioFormat: selection.audioFormat,
            expectedBytes: selection.expectedBytes,
            galleryIndices: selection.galleryIndices,
            directUrls: selection.directUrls,
        });
        resetLink();
    };

    const inProgress = downloads.filter(d => d.status !== 'completed');
    const recent = useMemo(() => downloads
        .filter(d => d.status === 'completed')
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
        .slice(0, RECENT_LIMIT), [downloads]);
    const stoppableCount = downloads.filter(d => d.status === 'downloading' || d.status === 'queued').length;
    const resumableCount = downloads.filter(d => d.status === 'paused').length;
    const runningCount = downloads.filter(d => d.status === 'downloading' || d.status === 'pending').length;
    const queuedCount = downloads.filter(d => d.status === 'queued').length;
    const totalSpeedBps = downloads.reduce((total, d) => total + (d.status === 'downloading' ? d.speedBps || 0 : 0), 0);
    const totalSpeed = totalSpeedBps > 0 ? `${formatFileSize(totalSpeedBps, true)}/s` : undefined;

    const showPreview = isMediaUrl && !isDirectPlaylistUrl(url) && Boolean(videoInfo || isLoadingInfo || infoError);
    const secondaryButtonClass = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-foreground/10 bg-secondary/50 text-foreground/80 hover:text-foreground hover:border-primary/30';

    return (
        <div className="h-full w-full bg-transparent flex flex-col gap-6 p-6 lg:p-8 overflow-auto scroll-smooth">
            <motion.form
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="panel p-4 lg:p-5 max-w-3xl mx-auto w-full"
            >
                <div className="flex items-center bg-secondary/50 border border-foreground/10 rounded-2xl px-3 py-1.5 focus-within:border-primary/50 transition-colors">
                    <input
                        ref={inputRef}
                        type="text"
                        value={url}
                        onChange={(e) => handleUrlChange(e.target.value.trim())}
                        placeholder={t('home.pasteAnyLink')}
                        aria-label={t('home.pasteAnyLink')}
                        autoFocus
                        className="flex-1 bg-transparent border-none focus:ring-0 text-foreground placeholder:text-foreground/40 h-11 px-1 outline-none text-base"
                    />
                    {url ? (
                        <button
                            type="button"
                            onClick={resetLink}
                            className="p-2 rounded-lg text-foreground/50 hover:bg-foreground/10 hover:text-foreground transition-colors"
                            title={t('home.clearLink')}
                            aria-label={t('home.clearLink')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    ) : (
                        // One paste control: highlighted when a link is already on the clipboard.
                        <button
                            type="button"
                            onClick={() => (clipboardUrl ? handleUrlChange(clipboardUrl) : void handlePaste())}
                            className={cn(
                                'p-2 rounded-lg transition-colors',
                                clipboardUrl
                                    ? 'bg-primary/15 text-primary hover:bg-primary/25'
                                    : 'text-foreground/60 hover:bg-foreground/10 hover:text-foreground'
                            )}
                            title={clipboardUrl ? `${t('home.pasteDetected')}: ${clipboardUrl}` : t('home.paste', 'Paste from clipboard')}
                            aria-label={clipboardUrl ? t('home.pasteDetected') : t('home.paste', 'Paste from clipboard')}
                        >
                            <Clipboard className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowSearchModal(true)}
                        className="p-2 rounded-lg text-foreground/60 hover:bg-foreground/10 hover:text-foreground transition-colors"
                        title={t('home.search')}
                        aria-label={t('home.search')}
                    >
                        <Search className="w-4 h-4" />
                    </button>
                </div>

                <AnimatePresence initial={false}>
                    {showPreview && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="pt-4">
                                <UrlPreview
                                    videoInfo={videoInfo}
                                    isLoading={isLoadingInfo}
                                    isEnriching={isEnrichingInfo}
                                    error={infoError}
                                >
                                    {fetchProblem && !isEnrichingInfo && (
                                        <div className="flex flex-wrap items-center gap-2 text-xs bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 mb-3">
                                            {fetchProblem.kind === 'login' ? <Lock className="w-3.5 h-3.5 text-warning shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />}
                                            <span className="flex-1 min-w-[180px] text-foreground/80">
                                                {fetchProblem.kind === 'login'
                                                    ? t('home.loginRequired', { site: fetchProblem.site || '' })
                                                    : fetchProblem.kind === 'blocked'
                                                        ? t('home.fetchBlocked')
                                                        : t('home.fetchFailed')}
                                            </span>
                                            {fetchProblem.kind === 'login' && fetchProblem.site && (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={isSigningIn}
                                                        onClick={() => void handleSiteSignIn(fetchProblem.site!)}
                                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-60"
                                                    >
                                                        {isSigningIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                                                        {t('home.signInHere')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isSigningIn}
                                                        onClick={() => void handleImportCookies()}
                                                        title={t('settings.importCookiesHelp')}
                                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-foreground/15 text-foreground/75 hover:text-foreground disabled:opacity-60"
                                                    >
                                                        <Upload className="w-3.5 h-3.5" />
                                                        {t('settings.importCookies')}
                                                    </button>
                                                </>
                                            )}
                                            {fetchProblem.kind !== 'login' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setReloadKey((key) => key + 1)}
                                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-foreground/15 text-foreground/75 hover:text-foreground"
                                                >
                                                    <RotateCw className="w-3.5 h-3.5" />
                                                    {t('home.tryAgain')}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <FormatPanel
                                        // A new link starts from the default choices.
                                        key={url}
                                        ref={panelRef}
                                        videoInfo={videoInfo}
                                        isLoadingQualities={isEnrichingInfo}
                                        timestampSeconds={timestampSeconds}
                                        duplicate={duplicate}
                                        defaultQuality={settings.defaultQuality}
                                        defaultTurboEnabled={settings.enableTurboDownload}
                                        defaultAdaptiveTurbo={settings.adaptiveTurboDownload}
                                        defaultTurboConnections={settings.turboConnections}
                                        onDownload={handleFormatDownload}
                                    />
                                </UrlPreview>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {isPlaylistUrl && (
                    <div className="flex gap-2 flex-wrap mt-3">
                        <button type="button" onClick={() => setShowPlaylistModal(true)} className={secondaryButtonClass}>
                            <ListVideo className="w-3.5 h-3.5" />
                            {t('home.openPlaylist')}
                        </button>
                    </div>
                )}
            </motion.form>

            {inProgress.length > 0 && (
                <section className="max-w-3xl mx-auto w-full space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <Zap className="w-4 h-4 text-primary shrink-0" />
                            <h2 className="text-sm font-semibold text-foreground">{t('home.activeDownloads')}</h2>
                            <span className="text-xs text-foreground/50 truncate">
                                {[
                                    runningCount > 0 ? t('home.runningCount', { count: runningCount }) : undefined,
                                    queuedCount > 0 ? t('home.queuedCount', { count: queuedCount }) : undefined,
                                    totalSpeed,
                                ].filter(Boolean).join(' · ')}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => void stopAllDownloads().catch(console.error)}
                                className="p-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                disabled={stoppableCount === 0}
                                title={stoppableCount === 0 ? t('home.noRunningToStop') : t('home.stopAllRunning')}
                            >
                                <Pause className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => void resumeAllDownloads().catch(console.error)}
                                className="p-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                disabled={resumableCount === 0}
                                title={resumableCount === 0 ? t('home.noPausedToResume') : t('home.resumeAllPaused')}
                            >
                                <Play className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => void cancelAllDownloads().catch(console.error)}
                                className="p-1.5 rounded-lg text-foreground/60 hover:text-error hover:bg-error/10 transition-colors"
                                title={t('home.cancelAllActive')}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {inProgress.map(item => (
                        <DownloadCard
                            key={item.id}
                            item={item}
                            onCancel={cancelDownload}
                            onPause={pauseDownload}
                            onResume={resumeDownload}
                            onBoost={boostDownload}
                            onRetry={retryDownload}
                            onOpenFolder={openFolder}
                        />
                    ))}
                </section>
            )}

            {recent.length > 0 && (
                <section className="max-w-3xl mx-auto w-full space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-foreground/65">{t('home.recentHistory')}</h2>
                        {onNavigate && (
                            <button
                                type="button"
                                onClick={() => onNavigate(settings.historyEnabled ? 'history' : 'downloads')}
                                className="flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground transition-colors"
                            >
                                {t('home.seeAll')}
                                <ArrowRight className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {recent.map(item => (
                        <DownloadCard
                            key={item.id}
                            item={item}
                            onCancel={cancelDownload}
                            onOpenFolder={openFolder}
                        />
                    ))}
                </section>
            )}

            {downloads.length === 0 && !url && (
                <div className="flex-1 flex flex-col items-center justify-center text-center pb-10">
                    <p className="text-foreground/30 text-sm">
                        {t('home.dropHint')}
                    </p>
                </div>
            )}

            <SearchModal
                isOpen={showSearchModal}
                onClose={() => setShowSearchModal(false)}
                contextUrl={isMediaUrl ? url : undefined}
                onOpenLink={handleUrlChange}
            />

            <PlaylistModal
                isOpen={showPlaylistModal}
                onClose={() => setShowPlaylistModal(false)}
                url={url}
            />
        </div>
    );
};

export default Home;
