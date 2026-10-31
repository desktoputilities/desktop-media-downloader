import { describe, expect, it } from 'vitest';
import {
  createQuickVideoInfoSeed,
  getOEmbedEndpoint,
  parseQuickHtmlMetadata,
  summarizeAudioDownload,
  summarizeRequestedDownloads,
} from './video-info';

describe('per-quality download sizes', () => {
  // Shapes taken from yt-dlp's requested_downloads for a merged YouTube video.
  const merged = (height: number, videoBytes: number, ext = 'mp4') => ({
    ext,
    requested_formats: [
      { height, filesize: videoBytes },
      { height: null, filesize: 10271496 },
    ],
  });

  it('sums the video and audio parts and marks exact server sizes', () => {
    const details = summarizeRequestedDownloads([merged(1080, 257619653)], [1080]);

    expect(details['1080']).toEqual({ bytes: 267891149, exact: true, ext: 'mp4' });
  });

  it('marks the size approximate when any part only has an estimate', () => {
    const details = summarizeRequestedDownloads([{
      ext: 'mp4',
      requested_formats: [{ height: 720, filesize_approx: 1000 }, { filesize: 500 }],
    }], [720]);

    expect(details['720']).toEqual({ bytes: 1500, exact: false, ext: 'mp4' });
  });

  it('only uses a result whose height matches the offered quality', () => {
    // The 1080 limit resolved to a 1076p stream, so 1080 gets no exact size.
    const details = summarizeRequestedDownloads([merged(1076, 100), merged(720, 50, 'mkv')], [1080, 1076, 720]);

    expect(Object.keys(details).sort()).toEqual(['1076', '720']);
    expect(details['720'].ext).toBe('mkv');
  });

  it('handles single combined formats and missing data', () => {
    expect(summarizeRequestedDownloads([{ ext: 'mp4', height: 360, filesize: 42 }], [360]))
      .toEqual({ '360': { bytes: 42, exact: true, ext: 'mp4' } });
    expect(summarizeRequestedDownloads(undefined, [360])).toEqual({});
  });
});

describe('quick video metadata', () => {
  it('creates an immediate YouTube thumbnail without a network request', () => {
    const seed = createQuickVideoInfoSeed('https://youtu.be/jNQXAC9IVRw?t=4');

    expect(seed).toMatchObject({
      id: 'jNQXAC9IVRw',
      title: 'YouTube video',
      uploader: 'YouTube',
      extractor: 'YouTube',
    });
    expect(seed.thumbnail).toContain('/jNQXAC9IVRw/');
  });

  it('extracts Open Graph metadata regardless of attribute order', () => {
    const metadata = parseQuickHtmlMetadata(`
      <html><head>
        <meta content="Fast &amp; Focused" property="og:title">
        <meta content="/poster.jpg" name="twitter:image">
        <meta property="og:site_name" content="Example Media">
      </head></html>
    `, 'https://example.com/watch/123');

    expect(metadata).toEqual({
      title: 'Fast & Focused',
      thumbnail: 'https://example.com/poster.jpg',
      uploader: 'Example Media',
    });
  });

  it('selects provider oEmbed endpoints only where they are public', () => {
    expect(getOEmbedEndpoint('https://www.youtube.com/watch?v=abc')).toContain('youtube.com/oembed');
    expect(getOEmbedEndpoint('https://vimeo.com/123')).toContain('vimeo.com/api/oembed.json');
    expect(getOEmbedEndpoint('https://example.com/video')).toBeUndefined();
  });
});

describe('original audio size', () => {
  it('reports the audio-only result and ignores video results', () => {
    const downloads = [
      { ext: 'mp4', requested_formats: [{ vcodec: 'avc1', acodec: 'none', filesize: 900 }, { vcodec: 'none', acodec: 'mp4a', filesize: 100 }] },
      { ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', filesize: 1594000 },
    ];
    expect(summarizeAudioDownload(downloads)).toEqual({ bytes: 1594000, exact: true, ext: 'm4a' });
  });

  it('returns nothing when the site has no separate audio stream', () => {
    expect(summarizeAudioDownload([{ ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', filesize: 500 }])).toBeUndefined();
    expect(summarizeAudioDownload(undefined)).toBeUndefined();
  });
});
