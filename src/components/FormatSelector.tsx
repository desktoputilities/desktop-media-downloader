import React from 'react';
import { Video, Music, Image as ImageIcon, FolderOpen, Loader2, ArrowRight, History as HistoryIcon, Gauge, X } from 'lucide-react';
import { cn, formatFileSize } from '../lib/utils';
import { formatClockTime } from '../lib/videoPreview';
import { useTranslation } from 'react-i18next';
import type { AudioFormat, HistoryItem, VideoInfo } from '../context/DownloadContext';

export interface FormatSelection {
    format: 'video' | 'audio' | 'photo';
    quality?: string;
    audioFormat?: AudioFormat;
    photoTimestampMode?: 'screenshot' | 'thumbnail';
    outputDir?: string;
    turboOverride: { enabled: boolean; adaptive?: boolean; connections?: number };
    // Only exact sizes; an estimate would make the progress bar drift.
    expectedBytes?: number;
}

export interface FormatPanelHandle {
    submit: () => void;
}

interface FormatPanelProps {
    videoInfo: VideoInfo | null;
    isLoadingQualities?: boolean;
    timestampSeconds?: number;
    duplicate?: HistoryItem;
    defaultQuality?: string;
    defaultTurboEnabled?: boolean;
    defaultAdaptiveTurbo?: boolean;
    defaultTurboConnections?: number;
    onDownload: (selection: FormatSelection) => void;
}

const folderName = (folderPath: string): string => folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath;

// LAME's default VBR level (yt-dlp --audio-quality 5) averages about 130 kbit/s.
const MP3_ESTIMATE_BITS_PER_SECOND = 130_000;

const FormatPanel = React.forwardRef<FormatPanelHandle, FormatPanelProps>(({
    videoInfo,
    isLoadingQualities = false,
    timestampSeconds,
    duplicate,
    defaultQuality = 'best',
    defaultTurboEnabled = false,
    defaultAdaptiveTurbo = false,
    defaultTurboConnections = 8,
    onDownload,
}, ref) => {
    const { t, i18n } = useTranslation();
    const hasTimestamp = timestampSeconds !== undefined;
    const [selectedFormat, setSelectedFormat] = React.useState<'video' | 'audio' | 'photo'>('video');
    const [selectedQuality, setSelectedQuality] = React.useState<string>('');
    const [audioFormat, setAudioFormat] = React.useState<AudioFormat>('mp3');
    const [photoMode, setPhotoMode] = React.useState<'screenshot' | 'thumbnail'>(hasTimestamp ? 'screenshot' : 'thumbnail');
    const [customOutputDir, setCustomOutputDir] = React.useState<string>('');
    const [isSelectingFolder, setIsSelectingFolder] = React.useState(false);
    const [turboEnabled, setTurboEnabled] = React.useState<boolean>(defaultTurboEnabled);

    // Keep quality array stable across rerenders so selection does not reset while user clicks.
    const qualities = videoInfo?.videoQualities;
    const sortedQualities = React.useMemo(() => [...(qualities || [])].sort((a, b) => b - a), [qualities]);
    const qualityDetails = videoInfo?.videoQualityDetails || {};
    const qualitySizes = videoInfo?.videoQualitySizes || {};

    // Default to the preferred quality from settings, else the highest available.
    React.useEffect(() => {
        if (sortedQualities.length === 0) return;
        if (selectedQuality && sortedQualities.includes(Number(selectedQuality))) return;
        const preferred = Number(defaultQuality);
        setSelectedQuality(String(Number.isFinite(preferred) && sortedQualities.includes(preferred) ? preferred : sortedQualities[0]));
    }, [sortedQualities, selectedQuality, defaultQuality]);

    React.useEffect(() => {
        setPhotoMode(hasTimestamp ? 'screenshot' : 'thumbnail');
    }, [hasTimestamp]);

    const audioOriginal = videoInfo?.audioDetail;
    const mp3EstimateBytes = videoInfo?.duration ? (videoInfo.duration * MP3_ESTIMATE_BITS_PER_SECOND) / 8 : undefined;

    const describeQuality = (quality: number) => {
        const detail = qualityDetails[String(quality)];
        const size = detail
            ? formatFileSize(detail.bytes, detail.exact)
            : formatFileSize(qualitySizes[String(quality)]);
        return [size, detail?.ext?.toUpperCase()].filter(Boolean).join(' · ') || t('formatSelector.sizeUnknown', 'Size unknown');
    };

    const expectedBytesFor = (): number | undefined => {
        if (selectedFormat === 'video') {
            const detail = qualityDetails[selectedQuality];
            return detail?.exact ? detail.bytes : undefined;
        }
        if (selectedFormat === 'audio' && audioFormat === 'original') {
            return audioOriginal?.exact ? audioOriginal.bytes : undefined;
        }
        return undefined;
    };

    const handleDownload = () => {
        onDownload({
            format: selectedFormat,
            quality: selectedFormat === 'video' ? (selectedQuality || undefined) : undefined,
            audioFormat: selectedFormat === 'audio' ? audioFormat : undefined,
            photoTimestampMode: selectedFormat === 'photo' ? photoMode : undefined,
            outputDir: customOutputDir || undefined,
            turboOverride: {
                enabled: turboEnabled,
                adaptive: defaultAdaptiveTurbo,
                connections: defaultTurboConnections,
            },
            expectedBytes: expectedBytesFor(),
        });
    };

    React.useImperativeHandle(ref, () => ({ submit: handleDownload }));

    const handlePickOutputFolder = async () => {
        if (!window.electronAPI?.pickDownloadLocationOnce) return;
        setIsSelectingFolder(true);
        try {
            const result = await window.electronAPI.pickDownloadLocationOnce(customOutputDir || undefined);
            if (result.success && !result.canceled && result.data?.path) {
                setCustomOutputDir(result.data.path);
            }
        } finally {
            setIsSelectingFolder(false);
        }
    };

    const downloadLabel = selectedFormat === 'video'
        ? (selectedQuality ? `${selectedQuality}p` : t('formatSelector.bestAvailable'))
        : selectedFormat === 'audio'
            ? (audioFormat === 'mp3' ? 'MP3' : t('formatSelector.original'))
            : (photoMode === 'screenshot' ? t('formatSelector.frame') : t('formatSelector.thumbnail'));

    const duplicateLabel = duplicate ? [
        new Date(duplicate.completedAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' }),
        duplicate.format === 'video' && duplicate.quality && /^\d+$/.test(duplicate.quality) ? `${duplicate.quality}p` : undefined,
        duplicate.fileExt?.toUpperCase() || (duplicate.format === 'audio' ? t('formatSelector.audio') : duplicate.format === 'photo' ? t('formatSelector.photo') : undefined),
    ].filter(Boolean).join(' · ') : undefined;

    const tabs = [
        { id: 'video' as const, icon: Video, label: t('formatSelector.video') },
        { id: 'audio' as const, icon: Music, label: t('formatSelector.audio') },
        { id: 'photo' as const, icon: ImageIcon, label: t('formatSelector.photo') },
    ];

    const chipClass = (selected: boolean, disabled = false) => cn(
        'flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition-colors duration-150',
        disabled
            ? 'border-foreground/5 bg-secondary/20 text-foreground/30 cursor-not-allowed'
            : selected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary/50 border-foreground/5 hover:bg-secondary/80 text-foreground'
    );
    const chipSubClass = (selected: boolean) => cn('text-[11px]', selected ? 'text-primary-foreground/80' : 'text-foreground/50');

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/40 w-fit" role="tablist">
                {tabs.map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={selectedFormat === id}
                        onClick={() => setSelectedFormat(id)}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            selectedFormat === id ? 'bg-card text-foreground shadow-sm' : 'text-foreground/55 hover:text-foreground'
                        )}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {selectedFormat === 'video' && (
                sortedQualities.length === 0 ? (
                    <div className="text-xs text-foreground/50 flex items-center gap-2 py-3">
                        {isLoadingQualities ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('formatSelector.loadingQualities')}</>
                        ) : (
                            t('formatSelector.bestAuto', 'Best quality will be selected automatically.')
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
                        {sortedQualities.map((quality) => {
                            const selected = selectedQuality === String(quality);
                            return (
                                <button
                                    type="button"
                                    key={quality}
                                    onClick={() => setSelectedQuality(String(quality))}
                                    className={chipClass(selected)}
                                >
                                    <span className="font-semibold text-sm">{quality}p</span>
                                    <span className={chipSubClass(selected)}>{describeQuality(quality)}</span>
                                </button>
                            );
                        })}
                    </div>
                )
            )}

            {selectedFormat === 'audio' && (
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                    <button type="button" onClick={() => setAudioFormat('mp3')} className={chipClass(audioFormat === 'mp3')}>
                        <span className="font-semibold text-sm">MP3</span>
                        <span className={chipSubClass(audioFormat === 'mp3')}>
                            {formatFileSize(mp3EstimateBytes) || t('formatSelector.sizeUnknown', 'Size unknown')}
                        </span>
                    </button>
                    <button type="button" onClick={() => setAudioFormat('original')} className={chipClass(audioFormat === 'original')}>
                        <span className="font-semibold text-sm">{t('formatSelector.original')}</span>
                        <span className={chipSubClass(audioFormat === 'original')}>
                            {audioOriginal
                                ? [formatFileSize(audioOriginal.bytes, audioOriginal.exact), audioOriginal.ext?.toUpperCase()].filter(Boolean).join(' · ')
                                : isLoadingQualities ? t('formatSelector.loadingQualities') : t('formatSelector.noConversion')}
                        </span>
                    </button>
                </div>
            )}

            {selectedFormat === 'photo' && (
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2 max-w-sm">
                        <button type="button" onClick={() => setPhotoMode('thumbnail')} className={chipClass(photoMode === 'thumbnail')}>
                            <span className="font-semibold text-sm">{t('formatSelector.thumbnail')}</span>
                            <span className={chipSubClass(photoMode === 'thumbnail')}>{t('formatSelector.thumbnailDesc')}</span>
                        </button>
                        <button
                            type="button"
                            disabled={!hasTimestamp}
                            onClick={() => setPhotoMode('screenshot')}
                            className={chipClass(photoMode === 'screenshot', !hasTimestamp)}
                        >
                            <span className="font-semibold text-sm">{t('formatSelector.frame')}</span>
                            <span className={chipSubClass(photoMode === 'screenshot')}>
                                {hasTimestamp ? t('formatSelector.frameAt', { time: formatClockTime(timestampSeconds ?? 0) }) : t('formatSelector.frameNoTime')}
                            </span>
                        </button>
                    </div>
                    {!hasTimestamp && (
                        <p className="text-[11px] text-foreground/45">{t('formatSelector.frameTip')}</p>
                    )}
                </div>
            )}

            {duplicateLabel && (
                <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                    <HistoryIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('formatSelector.alreadyDownloaded', { details: duplicateLabel })}</span>
                </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    {/* Save location for this download: folder name shows once one is chosen. */}
                    <button
                        type="button"
                        onClick={() => void handlePickOutputFolder()}
                        disabled={isSelectingFolder}
                        className={cn(
                            'flex items-center gap-1.5 h-9 px-2.5 rounded-lg border text-xs transition-colors min-w-0 disabled:opacity-60',
                            customOutputDir
                                ? 'border-primary/35 bg-primary/10 text-foreground'
                                : 'border-foreground/10 text-foreground/55 hover:text-foreground hover:bg-foreground/5'
                        )}
                        title={`${t('formatSelector.outputFolder')}: ${customOutputDir || t('formatSelector.defaultFolder')}`}
                        aria-label={t('formatSelector.outputFolder')}
                    >
                        {isSelectingFolder ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <FolderOpen className="w-4 h-4 shrink-0" />}
                        {customOutputDir && <span className="truncate max-w-[160px]">{folderName(customOutputDir)}</span>}
                    </button>
                    {customOutputDir && (
                        <button
                            type="button"
                            onClick={() => setCustomOutputDir('')}
                            className="p-1.5 rounded-md text-foreground/45 hover:text-foreground hover:bg-foreground/5"
                            title={t('formatSelector.defaultBtn', 'Default')}
                            aria-label={t('formatSelector.defaultBtn', 'Default')}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={turboEnabled}
                        onClick={() => setTurboEnabled(v => !v)}
                        className={cn(
                            'flex items-center justify-center h-9 w-9 rounded-lg border transition-colors',
                            turboEnabled
                                ? 'border-primary/35 bg-primary/10 text-foreground'
                                : 'border-foreground/10 text-foreground/55 hover:text-foreground hover:bg-foreground/5'
                        )}
                        title={`${t('formatSelector.turboDownload')}: ${turboEnabled ? t('formatSelector.on') : t('formatSelector.off')} · ${t('formatSelector.turboOverride')}`}
                        aria-label={t('formatSelector.turboDownload')}
                    >
                        <Gauge className="w-4 h-4" />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={handleDownload}
                    className="h-10 px-5 rounded-xl font-medium bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 shadow-md transition-colors shrink-0"
                >
                    {duplicate ? t('formatSelector.downloadAgain') : t('formatSelector.confirm')} {downloadLabel}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
});

FormatPanel.displayName = 'FormatPanel';

export default FormatPanel;
