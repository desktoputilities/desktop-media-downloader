import { describe, expect, it } from 'vitest';
import { siteNameFromExtractor, siteNameFromUrl } from './siteNames';

describe('site names', () => {
    it('names known sites from the link', () => {
        expect(siteNameFromUrl('https://soundcloud.com/forss/flickermood')).toBe('SoundCloud');
        expect(siteNameFromUrl('https://bsky.app/profile/bsky.app/post/3myx7vphq3s2j')).toBe('Bluesky');
        expect(siteNameFromUrl('https://m.youtube.com/watch?v=jNQXAC9IVRw')).toBe('YouTube');
        expect(siteNameFromUrl('https://youtu.be/jNQXAC9IVRw')).toBe('YouTube');
        expect(siteNameFromUrl('https://x.com/user/status/1')).toBe('X');
        expect(siteNameFromUrl('https://old.reddit.com/r/pics/comments/abc')).toBe('Reddit');
    });

    it('does not match a site name inside another domain', () => {
        expect(siteNameFromUrl('https://www.dropbox.com/s/abc/file.mp4')).toBe('dropbox.com');
        expect(siteNameFromUrl('https://netflix.com/title/1')).toBe('netflix.com');
    });

    it('falls back to the host, then to "Web"', () => {
        expect(siteNameFromUrl('https://www.example.org/video')).toBe('example.org');
        expect(siteNameFromUrl('not a link')).toBe('Web');
    });

    it('names sites from extractor keys', () => {
        expect(siteNameFromExtractor('youtube:tab')).toBe('YouTube');
        expect(siteNameFromExtractor('Generic')).toBe('Generic');
        expect(siteNameFromExtractor(undefined)).toBeUndefined();
    });
});
