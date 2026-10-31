import { describe, expect, it } from 'vitest';
import { formatFileSize } from './utils';

describe('file size labels', () => {
    it('shows exact sizes without a tilde and estimates with one', () => {
        expect(formatFileSize(267891149, true)).toBe('255 MB');
        expect(formatFileSize(267891149)).toBe('~255 MB');
    });

    it('scales units and precision', () => {
        expect(formatFileSize(512, true)).toBe('512 B');
        expect(formatFileSize(1536, true)).toBe('1.50 KB');
        expect(formatFileSize(1372540977, true)).toBe('1.28 GB');
    });

    it('returns nothing for unknown sizes', () => {
        expect(formatFileSize(undefined)).toBeUndefined();
        expect(formatFileSize(0, true)).toBeUndefined();
    });
});
