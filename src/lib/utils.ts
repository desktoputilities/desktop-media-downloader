import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Binary units with MB/GB labels, matching what Windows Explorer shows.
// Estimates get a "~" prefix; exact byte counts from the server do not.
export function formatFileSize(bytes?: number, exact = false): string | undefined {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return undefined;
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${exact ? '' : '~'}${value.toFixed(precision)} ${units[unitIndex]}`;
}

// Run asynchronous work with a concurrency cap to avoid overwhelming IPC.
export async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
) {
    const queue = [...items];
    const runners: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
        const next = queue.shift();
        if (next === undefined) return;
        await worker(next);
        await runNext();
    };

    for (let i = 0; i < Math.min(limit, items.length); i += 1) {
        runners.push(runNext());
    }

    await Promise.all(runners);
}
