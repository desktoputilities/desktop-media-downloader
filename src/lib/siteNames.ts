// Display names for media sites, shared by the link preview and the download lists.

// yt-dlp and gallery-dl report extractor keys such as "Youtube" or "youtube:tab".
const EXTRACTOR_NAMES: Record<string, string> = {
    youtube: 'YouTube', vimeo: 'Vimeo', tiktok: 'TikTok', instagram: 'Instagram', twitter: 'X', x: 'X',
    bluesky: 'Bluesky', reddit: 'Reddit', pinterest: 'Pinterest', imgur: 'Imgur', tumblr: 'Tumblr', flickr: 'Flickr',
    soundcloud: 'SoundCloud', wikimedia: 'Wikimedia', deviantart: 'DeviantArt', artstation: 'ArtStation', pixiv: 'pixiv', threads: 'Threads',
};

// Matched against the link's host and its parent domains, so "m.youtube.com" is YouTube
// but "dropbox.com" is not X.
const DOMAIN_NAMES: Record<string, string> = {
    'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo', 'tiktok.com': 'TikTok',
    'instagram.com': 'Instagram', 'x.com': 'X', 'twitter.com': 'X', 'bsky.app': 'Bluesky',
    'reddit.com': 'Reddit', 'redd.it': 'Reddit', 'pinterest.com': 'Pinterest', 'pin.it': 'Pinterest',
    'imgur.com': 'Imgur', 'tumblr.com': 'Tumblr', 'flickr.com': 'Flickr', 'soundcloud.com': 'SoundCloud',
    'wikimedia.org': 'Wikimedia', 'wikipedia.org': 'Wikipedia', 'deviantart.com': 'DeviantArt',
    'artstation.com': 'ArtStation', 'pixiv.net': 'pixiv', 'threads.net': 'Threads', 'threads.com': 'Threads',
    'bilibili.com': 'Bilibili', 'b23.tv': 'Bilibili', 'nicovideo.jp': 'Niconico', 'twitch.tv': 'Twitch',
    'dailymotion.com': 'Dailymotion', 'facebook.com': 'Facebook', 'fb.watch': 'Facebook',
    'bandcamp.com': 'Bandcamp', 'archive.org': 'Internet Archive',
};

export const siteNameFromExtractor = (extractor?: string): string | undefined =>
    extractor ? EXTRACTOR_NAMES[extractor.split(':')[0].toLowerCase()] || extractor : undefined;

// A known site's name, otherwise the link's host without "www.", or "Web" for a malformed link.
export const siteNameFromUrl = (url: string): string => {
    let host: string;
    try {
        host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return 'Web';
    }
    if (!host) return 'Web';
    const parts = host.split('.');
    for (let i = 0; i < parts.length - 1; i += 1) {
        const name = DOMAIN_NAMES[parts.slice(i).join('.')];
        if (name) return name;
    }
    return host;
};
