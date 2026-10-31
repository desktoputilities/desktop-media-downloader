import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadItem, DownloadSettings } from './DownloadContext';
import {
    buildRestartOptions,
    createThrottledWriter,
    PLACEHOLDER_TITLE,
    removeAllTerminalDownloads,
    removeRelatedTerminalDownloads,
} from './downloadState';

const sourceUrl = 'https://www.youtube.com/watch?v=example';

describe('download/history state synchronization', () => {
    it('removes completed and failed records for the deleted history URL', () => {
        const downloads = [
            { id: 'completed', url: sourceUrl, status: 'completed' },
            { id: 'failed', url: sourceUrl, status: 'error' },
            { id: 'active', url: sourceUrl, status: 'downloading' },
            { id: 'other', url: 'https://example.com/other', status: 'completed' },
        ];

        expect(removeRelatedTerminalDownloads(downloads, sourceUrl).map(item => item.id)).toEqual([
            'active',
            'other',
        ]);
    });

    it('keeps active work when all history entries are cleared', () => {
        const downloads = [
            { id: 'pending', url: sourceUrl, status: 'pending' },
            { id: 'paused', url: sourceUrl, status: 'paused' },
            { id: 'completed', url: sourceUrl, status: 'completed' },
            { id: 'failed', url: sourceUrl, status: 'error' },
        ];

        expect(removeAllTerminalDownloads(downloads).map(item => item.id)).toEqual([
            'pending',
            'paused',
        ]);
    });
});

describe('restart options', () => {
    const download = {
        id: 'abc',
        url: sourceUrl,
        title: 'Example title',
        progress: 40,
        status: 'error',
        fileNameTemplate: '{title} [{quality}]',
    } as DownloadItem;
    const settings = { fileNameTemplate: '{title}' } as DownloadSettings;

    it('keeps the title and template so a retry finds the partial file', () => {
        expect(buildRestartOptions(download, settings)).toMatchObject({
            id: 'abc',
            titleOverride: 'Example title',
            fileNameTemplate: '{title} [{quality}]',
        });
    });

    it('does not use the placeholder title as a filename', () => {
        const options = buildRestartOptions({ ...download, title: PLACEHOLDER_TITLE }, settings);

        expect(options.titleOverride).toBeUndefined();
    });

    it('falls back to the current template for items saved by older versions', () => {
        const options = buildRestartOptions({ ...download, fileNameTemplate: undefined }, settings);

        expect(options.fileNameTemplate).toBe('{title}');
    });
});

describe('throttled writer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('keeps saving while updates arrive faster than the delay', () => {
        const write = vi.fn();
        const writer = createThrottledWriter<number>(write, 1000);

        for (let tick = 1; tick <= 25; tick += 1) {
            writer.schedule(tick);
            vi.advanceTimersByTime(100);
        }

        expect(write).toHaveBeenCalledTimes(2);
        expect(write).toHaveBeenLastCalledWith(20);
    });

    it('writes the latest value and nothing after cancel', () => {
        const write = vi.fn();
        const writer = createThrottledWriter<string>(write, 1000);

        writer.schedule('first');
        writer.schedule('latest');
        vi.advanceTimersByTime(1000);
        writer.schedule('dropped');
        writer.cancel();
        vi.advanceTimersByTime(1000);

        expect(write.mock.calls).toEqual([['latest']]);
    });
});
