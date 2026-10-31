import type { VideoInfo } from '../context/DownloadContext';

const youtubeIdFromUrl = (parsed: URL): string | undefined => {
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0];
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return undefined;

    const queryId = parsed.searchParams.get('v');
    if (queryId) return queryId;

    const parts = parsed.pathname.split('/').filter(Boolean);
    return ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : undefined;
};

const readableProvider = (host: string): string => {
    if (host.includes('youtube.com') || host === 'youtu.be') return 'YouTube';
    if (host.includes('vimeo.com')) return 'Vimeo';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host === 'x.com' || host.endsWith('.x.com') || host.includes('twitter.com')) return 'X';
    return host.replace(/^www\./, '');
};

const readablePathTitle = (parsed: URL): string | undefined => {
    const segment = parsed.pathname.split('/').filter(Boolean).pop();
    if (!segment || /^watch$/i.test(segment)) return undefined;

    try {
        const title = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim();
        return title ? title.replace(/\b\w/g, character => character.toUpperCase()) : undefined;
    } catch {
        return undefined;
    }
};

export const isCompleteMediaUrl = (value: string): boolean => {
    try {
        const parsed = new URL(value);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
    } catch {
        return false;
    }
};

// The first http(s) link in pasted or dropped text, if any.
export const extractLink = (text: string | null | undefined): string | undefined => {
    if (!text) return undefined;
    for (const line of text.split(/\r?\n/)) {
        const candidate = line.trim();
        if (!candidate || candidate.startsWith('#')) continue; // text/uri-list comments
        if (!isCompleteMediaUrl(candidate)) continue;
        return candidate;
    }
    return undefined;
};

// Reads a start time such as ?t=109, ?t=1m49s, ?start=90 or #t=1:49. Returns
// seconds, or undefined when the link has no time.
export const getUrlTimestampSeconds = (value: string): number | undefined => {
    const parseTime = (raw: string | null | undefined): number | undefined => {
        const text = (raw || '').trim().replace(/^(t|start)=/i, '');
        if (!text) return undefined;
        if (/^\d+(?:\.\d+)?s?$/.test(text)) return Math.floor(parseFloat(text));
        const units = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
        if (units && (units[1] || units[2] || units[3])) {
            return Number(units[1] || 0) * 3600 + Number(units[2] || 0) * 60 + Number(units[3] || 0);
        }
        const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
        if (clock) return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
        return undefined;
    };

    try {
        const parsed = new URL(value);
        return parseTime(parsed.searchParams.get('t'))
            ?? parseTime(parsed.searchParams.get('start'))
            ?? parseTime(parsed.searchParams.get('time_continue'))
            ?? parseTime(parsed.hash.replace(/^#/, ''));
    } catch {
        return undefined;
    }
};

export const formatClockTime = (totalSeconds: number): string => {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

export const createImmediateVideoPreview =(targetUrl: string): VideoInfo => {
    const parsed = new URL(targetUrl);
    const provider = readableProvider(parsed.hostname.toLowerCase());
    const youtubeId = youtubeIdFromUrl(parsed);

    return {
        id: youtubeId || targetUrl,
        title: youtubeId ? 'YouTube video' : readablePathTitle(parsed) || `${provider} media`,
        thumbnail: youtubeId ? `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg` : '',
        duration: 0,
        uploader: provider,
        webpage_url: targetUrl,
        extractor: provider,
        videoQualities: [],
        videoQualitySizes: {},
        hasAudio: true,
        isPartial: true,
    };
};
