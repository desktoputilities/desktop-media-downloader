import React from 'react';
import { Loader2, Clock, Eye, User, Calendar, ExternalLink, Video } from 'lucide-react';
import { VideoInfo } from '../context/DownloadContext';
import { useTranslation } from 'react-i18next';
import { siteNameFromExtractor } from '../lib/siteNames';

interface UrlPreviewProps {
    videoInfo: VideoInfo | null;
    isLoading: boolean;
    isEnriching?: boolean;
    error?: string;
    // Format options shown under the details, inside the same panel.
    children?: React.ReactNode;
}

const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatViewCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
};

const formatUploadDate = (dateStr: string, locale: string): string => {
    // yt-dlp format: YYYYMMDD
    if (/^\d{8}$/.test(dateStr)) {
        const date = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(4, 6)) - 1, Number(dateStr.slice(6, 8)));
        return date.toLocaleDateString(locale);
    }
    return dateStr;
};

const formatSource = (extractor?: string): string => siteNameFromExtractor(extractor) || 'Video';

const UrlPreview: React.FC<UrlPreviewProps> = ({ videoInfo, isLoading, isEnriching = false, error, children }) => {
    const { t, i18n } = useTranslation();
    if (isLoading) {
        return (
            <div className="py-4 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-foreground/70">{t('urlPreview.fetchingInfo')}</span>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <div className="bg-error/10 border border-error/25 rounded-xl p-3">
                    <p className="text-error text-sm">{error}</p>
                </div>
                {children && <div className="mt-4">{children}</div>}
            </div>
        );
    }

    if (!videoInfo) return null;

    return (
        <div className="animate-fade-in">
            <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="relative w-40 sm:w-48 aspect-video flex-shrink-0 rounded-xl overflow-hidden bg-secondary/60">
                    {videoInfo.thumbnail ? (
                        <img
                            src={videoInfo.thumbnail}
                            alt={videoInfo.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-8 h-8 text-foreground/25" />
                        </div>
                    )}
                    {videoInfo.duration > 0 && (
                        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 text-white rounded text-[11px] font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(videoInfo.duration)}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base line-clamp-2">
                            {videoInfo.title}
                        </h3>
                        {videoInfo.webpage_url && (
                            <a
                                href={videoInfo.webpage_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 -mt-1 rounded-lg hover:bg-foreground/10 text-foreground/40 hover:text-foreground transition-colors shrink-0"
                                title={t('history.openSource')}
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/55">
                        <span className="px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/70 font-medium">
                            {formatSource(videoInfo.extractor)}
                        </span>
                        {videoInfo.uploader && (
                            <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5" />
                                {videoInfo.uploader}
                            </span>
                        )}
                        {videoInfo.view_count ? (
                            <span className="flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5" />
                                {formatViewCount(videoInfo.view_count)} {t('urlPreview.views', { count: videoInfo.view_count, defaultValue: 'views' })}
                            </span>
                        ) : null}
                        {videoInfo.upload_date && (
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatUploadDate(videoInfo.upload_date, i18n.language)}
                            </span>
                        )}
                        {isEnriching && (
                            <span className="flex items-center gap-1 text-foreground/40">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t('urlPreview.fetchingInfo')}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {children && <div className="mt-4">{children}</div>}
        </div>
    );
};

export default UrlPreview;
