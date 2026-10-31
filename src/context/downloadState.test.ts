import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadItem, DownloadSettings } from './DownloadContext';
import {
    buildRestartOptions,
    createThrottledWriter,
    findHistoryMatch,
    pickQueuedToStart,
    trimCompletedDownloads,
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

describe('download queue', () => {
    const item = (id: string, status: string) => ({ id, url: `https://example.com/${id}`, status });

    it('starts the oldest queued items up to the parallel limit', () => {
        // Newest first, as the queue is stored.
        const downloads = [item('q3', 'queued'), item('q2', 'queued'), item('run', 'downloading'), item('q1', 'queued')];
        expect(pickQueuedToStart(downloads, 3)).toEqual(['q1', 'q2']);
    });

    it('counts preparing items as running and ignores paused ones', () => {
        const downloads = [item('q1', 'queued'), item('prep', 'pending'), item('paused', 'paused')];
        expect(pickQueuedToStart(downloads, 1)).toEqual([]);
        expect(pickQueuedToStart(downloads, 2)).toEqual(['q1']);
    });

    it('keeps only the newest finished items in the queue', () => {
        const downloads = [
            { ...item('old', 'completed'), completedAt: '2026-10-01T00:00:00Z' },
            { ...item('new', 'completed'), completedAt: '2026-10-02T00:00:00Z' },
            item('active', 'downloading'),
        ];
        expect(trimCompletedDownloads(downloads, 1).map(d => d.id)).toEqual(['new', 'active']);
    });
});

describe('duplicate detection', () => {
    it('matches the same video across link forms', () => {
        const history = [{ url: 'https://www.youtube.com/watch?v=SPnN8bABA7o', id: 'h1' }];
        expect(findHistoryMatch(history, 'https://youtu.be/SPnN8bABA7o?t=30')?.id).toBe('h1');
        expect(findHistoryMatch(history, 'https://youtu.be/other')).toBeUndefined();
    });
});
