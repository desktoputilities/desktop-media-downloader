import { describe, expect, it } from 'vitest';
import { createImmediateVideoPreview, extractLink, formatClockTime, getUrlTimestampSeconds, isCompleteMediaUrl } from './videoPreview';

describe('immediate renderer video preview', () => {
    it('rejects incomplete URLs before starting metadata work', () => {
        expect(isCompleteMediaUrl('https://')).toBe(false);
        expect(isCompleteMediaUrl('https://youtu.be/jNQXAC9IVRw')).toBe(true);
    });

    it('builds a YouTube preview without IPC or network access', () => {
        const preview = createImmediateVideoPreview('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=4');

        expect(preview).toMatchObject({
            id: 'jNQXAC9IVRw',
            title: 'YouTube video',
            uploader: 'YouTube',
            extractor: 'YouTube',
            isPartial: true,
        });
        expect(preview.thumbnail).toContain('/jNQXAC9IVRw/');
    });
});

describe('links from paste and drop', () => {
    it('takes the first web link from plain text or a uri-list', () => {
        expect(extractLink('  https://youtu.be/abc  ')).toBe('https://youtu.be/abc');
        expect(extractLink('# comment\r\nhttps://example.com/v\r\nhttps://other.com')).toBe('https://example.com/v');
        expect(extractLink('just some words')).toBeUndefined();
        expect(extractLink('file:///C:/video.mp4')).toBeUndefined();
    });
});

describe('timestamps in links', () => {
    it('reads the common time formats', () => {
        expect(getUrlTimestampSeconds('https://youtu.be/x?t=109')).toBe(109);
        expect(getUrlTimestampSeconds('https://youtu.be/x?t=109s')).toBe(109);
        expect(getUrlTimestampSeconds('https://www.youtube.com/watch?v=x&t=1m49s')).toBe(109);
        expect(getUrlTimestampSeconds('https://vimeo.com/1#t=1:49')).toBe(109);
        expect(getUrlTimestampSeconds('https://example.com/v?start=90')).toBe(90);
        expect(getUrlTimestampSeconds('https://youtu.be/x')).toBeUndefined();
    });

    it('formats seconds as a clock time', () => {
        expect(formatClockTime(109)).toBe('1:49');
        expect(formatClockTime(3725)).toBe('1:02:05');
    });
});
