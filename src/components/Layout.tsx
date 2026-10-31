import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, X, Maximize2, Link2 } from 'lucide-react';
import Sidebar from './Sidebar';
import Home, { type IncomingLink } from '../pages/Home';
import Downloads from '../pages/Downloads';
import History from '../pages/History';
import Settings from '../pages/Settings';
import Info from '../pages/Info';
import System from '../pages/System';
import DesktopMediaLogo from './DesktopMediaLogo';
import SetupWizard from './SetupWizard';
import WhatsNewModal from './WhatsNewModal';
import { extractLink } from '../lib/videoPreview';

// Window types are defined in vite-env.d.ts

const SETUP_COMPLETE_STORAGE_KEY = 'desktop-media-setup-complete-v1';
const WHATS_NEW_SEEN_VERSION_STORAGE_KEY = 'desktop-media-whats-new-seen-version';

type Page = 'home' | 'downloads' | 'history' | 'system' | 'settings' | 'info';

const PAGES: Page[] = ['home', 'downloads', 'history', 'system', 'settings', 'info'];

const isPage = (value: string): value is Page => {
    return (PAGES as string[]).includes(value);
};

const isEditableTarget = (target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable;
};

const Layout: React.FC = () => {
    const { t } = useTranslation();
    const [currentPage, setCurrentPage] = useState<Page>('home');
    const [showSetupWizard, setShowSetupWizard] = useState(false);
    const [hasAvailableUpdate, setHasAvailableUpdate] = useState(false);
    const [showWhatsNew, setShowWhatsNew] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    const [incomingLink, setIncomingLink] = useState<IncomingLink | null>(null);
    const [isDraggingLink, setIsDraggingLink] = useState(false);

    const handleNavigate = useCallback((page: string) => {
        if (isPage(page)) {
            setCurrentPage(page);
        }
    }, []);

    // Paste or drop a link on any screen: open Home with it in the link bar.
    const receiveLink = useCallback((text: string | null | undefined) => {
        const link = extractLink(text);
        if (!link) return false;
        setCurrentPage('home');
        setIncomingLink({ url: link, nonce: Date.now() });
        return true;
    }, []);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (isEditableTarget(e.target)) return;
            if (receiveLink(e.clipboardData?.getData('text/plain'))) e.preventDefault();
        };

        const carriesText = (e: DragEvent) => {
            const types = Array.from(e.dataTransfer?.types || []);
            return types.includes('text/uri-list') || types.includes('text/plain');
        };

        let dragDepth = 0;
        const handleDragEnter = (e: DragEvent) => {
            if (!carriesText(e)) return;
            dragDepth += 1;
            setIsDraggingLink(true);
        };
        const handleDragOver = (e: DragEvent) => {
            // Always cancel, so a dropped file or link never navigates the window.
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = carriesText(e) ? 'copy' : 'none';
        };
        const handleDragLeave = () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) setIsDraggingLink(false);
        };
        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            dragDepth = 0;
            setIsDraggingLink(false);
            receiveLink(e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain'));
        };

        document.addEventListener('paste', handlePaste);
        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);
        return () => {
            document.removeEventListener('paste', handlePaste);
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
        };
    }, [receiveLink]);

    const renderPage = (page: Page): React.ReactNode => {
        switch (page) {
            case 'home': return <Home incomingLink={incomingLink} onNavigate={handleNavigate} />;
            case 'downloads': return <Downloads />;
            case 'history': return <History />;
            case 'system': return <System />;
            case 'settings': return <Settings />;
            case 'info': return <Info />;
        }
    };

    useEffect(() => {
        const setupDismissed = localStorage.getItem(SETUP_COMPLETE_STORAGE_KEY);
        if (!setupDismissed) {
            setShowSetupWizard(true);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const detectUpdate = async () => {
            if (!window.electronAPI?.checkForUpdates) return;

            try {
                const result = await window.electronAPI.checkForUpdates();
                if (!cancelled && result.success && result.data) {
                    setHasAvailableUpdate(Boolean(result.data.updateAvailable));
                }
            } catch {
                if (!cancelled) {
                    setHasAvailableUpdate(false);
                }
            }
        };

        detectUpdate();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const prepareWhatsNew = async () => {
            if (!window.electronAPI?.getAppInfo) return;

            try {
                const result = await window.electronAPI.getAppInfo();
                const currentVersion = result?.success ? result.data?.version || '' : '';
                if (!currentVersion || cancelled) return;

                setAppVersion(currentVersion);
                const seenVersion = localStorage.getItem(WHATS_NEW_SEEN_VERSION_STORAGE_KEY);
                if (seenVersion !== currentVersion) {
                    setShowWhatsNew(true);
                }
            } catch {
                if (!cancelled) {
                    setShowWhatsNew(false);
                }
            }
        };

        prepareWhatsNew();

        return () => {
            cancelled = true;
        };
    }, []);

    // ==================== KEYBOARD SHORTCUTS ====================
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in input fields
            if (isEditableTarget(e.target)) {
                return;
            }

            const ctrlOrMeta = e.ctrlKey || e.metaKey;

            if (e.key === 'Escape') {
                if (showSetupWizard) {
                    handleSetupClose();
                } else if (showWhatsNew) {
                    handleWhatsNewClose();
                }
                return;
            }

            if (ctrlOrMeta && !e.shiftKey && !e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'd':
                        e.preventDefault();
                        setCurrentPage('downloads');
                        return;
                    case 'h':
                        e.preventDefault();
                        setCurrentPage('history');
                        return;
                    case ',':
                        e.preventDefault();
                        setCurrentPage('settings');
                        return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSetupWizard, showWhatsNew]);

    const handleSetupClose = () => {
        localStorage.setItem(SETUP_COMPLETE_STORAGE_KEY, 'true');
        setShowSetupWizard(false);
    };

    const handleWhatsNewClose = () => {
        if (appVersion) {
            localStorage.setItem(WHATS_NEW_SEEN_VERSION_STORAGE_KEY, appVersion);
        }
        setShowWhatsNew(false);
    };

    const handleMinimize = () => {
        if (window.electronAPI?.minimize) {
            window.electronAPI.minimize();
        } else {
            console.warn('No IPC available for minimize');
        }
    };

    const handleMaximize = () => {
        if (window.electronAPI?.maximize) {
            window.electronAPI.maximize();
        } else {
            console.warn('No IPC available for maximize');
        }
    };

    const handleClose = () => {
        if (window.electronAPI?.close) {
            window.electronAPI.close();
        } else {
            console.warn('No IPC available for close');
        }
    };

    return (
        <div className="flex flex-col h-screen text-foreground overflow-hidden relative">
            <div className="grid-overlay" />

            {/* Custom Titlebar */}
            <header className="h-12 glass-panel flex items-center justify-between px-4 drag-region select-none border-b border-foreground/5 flex-shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <DesktopMediaLogo />
                </div>
                <div className="flex items-center gap-1 no-drag">
                    <button
                        onClick={handleMinimize}
                        className="p-2 rounded-md hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
                        title={t('titlebar.minimize')}
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleMaximize}
                        className="p-2 rounded-md hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
                        title={t('titlebar.maximize')}
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-md hover:bg-error/15 text-foreground/60 hover:text-error transition-colors"
                        title={t('titlebar.close')}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Main Content Area with Sidebar */}
            <div className="flex flex-1 overflow-hidden z-10">
                <Sidebar
                    currentPage={currentPage}
                    onNavigate={handleNavigate}
                    showInfoBadge={hasAvailableUpdate}
                />
                <main className="flex-1 overflow-auto relative bg-background/60 border-l border-foreground/5">
                    {renderPage(currentPage)}
                </main>
            </div>

            {isDraggingLink && (
                <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-card/90 px-8 py-6 text-foreground">
                        <Link2 className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium">{t('home.dropToStart')}</span>
                    </div>
                </div>
            )}

            <SetupWizard isOpen={showSetupWizard} onClose={handleSetupClose} />
            <WhatsNewModal
                isOpen={showWhatsNew && !showSetupWizard}
                version={appVersion}
                onClose={handleWhatsNewClose}
            />
        </div>
    );
};

export default Layout;
