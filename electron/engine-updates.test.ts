import { describe, expect, it } from 'vitest'
import { compareVersions, ENGINES, engineFileName, findChecksum, isEngineCheckDue, normalizeVersion, versionFromEngineFile } from './engine-updates'

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('2026.10.26', '2026.08.19')).toBeGreaterThan(0)
    expect(compareVersions('1.32.19', '1.32.9')).toBeGreaterThan(0)
    expect(compareVersions('v1.32.17', '1.32.17')).toBe(0)
    expect(compareVersions('2026.08.19', '2026.08.19.1')).toBeLessThan(0)
    expect(compareVersions(null, '1.0')).toBeLessThan(0)
  })
})

describe('release helpers', () => {
  it('reads checksums in both list styles', () => {
    const hash = 'a'.repeat(64)
    expect(findChecksum(`${'b'.repeat(64)}  yt-dlp_x86.exe\n${hash}  yt-dlp.exe\n`, 'yt-dlp.exe')).toBe(hash)
    expect(findChecksum(`${hash.toUpperCase()} *gallery-dl.exe`, 'gallery-dl.exe')).toBe(hash)
    expect(findChecksum('nothing here', 'yt-dlp.exe')).toBeUndefined()
  })

  it('names updated files by version and reads them back', () => {
    expect(engineFileName('yt-dlp', '2026.10.26', 'win32')).toBe('yt-dlp-2026.10.26.exe')
    expect(versionFromEngineFile('yt-dlp', 'yt-dlp-2026.10.26.exe')).toBe('2026.10.26')
    expect(versionFromEngineFile('gallery-dl', 'gallery-dl-1.32.19')).toBe('1.32.19')
    expect(versionFromEngineFile('yt-dlp', 'yt-dlp-2026.10.26.exe.download')).toBeNull()
    expect(versionFromEngineFile('yt-dlp', 'gallery-dl-1.32.19.exe')).toBeNull()
    expect(normalizeVersion('v1.32.19')).toBe('1.32.19')
  })

  it('picks the right asset per platform', () => {
    expect(ENGINES['yt-dlp'].assetName('win32', 'x64')).toBe('yt-dlp.exe')
    expect(ENGINES['yt-dlp'].assetName('darwin', 'arm64')).toBe('yt-dlp_macos')
    expect(ENGINES['gallery-dl'].assetName('darwin', 'arm64')).toBeNull()
    expect(ENGINES['gallery-dl'].assetName('linux', 'x64')).toBe('gallery-dl.bin')
  })

  it('checks at most once a day', () => {
    const now = 1_800_000_000_000
    expect(isEngineCheckDue(undefined, now)).toBe(true)
    expect(isEngineCheckDue(now - 60_000, now)).toBe(false)
    expect(isEngineCheckDue(now - 25 * 60 * 60 * 1000, now)).toBe(true)
  })
})
