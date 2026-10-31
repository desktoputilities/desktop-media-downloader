// Release lookup and version rules for keeping yt-dlp and gallery-dl current
// without an app release. Kept free of Electron so it can be unit-tested.

export type EngineId = 'yt-dlp' | 'gallery-dl'

export interface EngineSpec {
  id: EngineId
  // Latest-release API; both answer with { tag_name, assets: [{ name, browser_download_url }] }.
  latestReleaseUrl: string
  checksumAsset: string
  assetName: (platform: string, arch: string) => string | null
}

export const ENGINES: Record<EngineId, EngineSpec> = {
  'yt-dlp': {
    id: 'yt-dlp',
    latestReleaseUrl: 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',
    checksumAsset: 'SHA2-256SUMS',
    assetName: (platform, arch) => {
      if (platform === 'win32') return arch === 'arm64' ? 'yt-dlp_arm64.exe' : arch === 'x64' ? 'yt-dlp.exe' : arch === 'ia32' ? 'yt-dlp_x86.exe' : null
      if (platform === 'darwin') return 'yt-dlp_macos'
      if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : arch === 'arm' ? 'yt-dlp_linux_armv7l' : arch === 'x64' ? 'yt-dlp_linux' : null
      return null
    },
  },
  'gallery-dl': {
    id: 'gallery-dl',
    latestReleaseUrl: 'https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases/latest',
    checksumAsset: 'SHA256SUMS',
    assetName: (platform, arch) => {
      if (platform === 'win32') return arch === 'x64' || arch === 'arm64' ? 'gallery-dl.exe' : arch === 'ia32' ? 'gallery-dl_x86.exe' : null
      if (platform === 'linux' && arch === 'x64') return 'gallery-dl.bin'
      return null
    },
  },
}

// Compares dotted versions numerically: 2026.10.26 > 2026.8.19, 1.32.19 > 1.32.9.
// Returns a positive number when a is newer.
export const compareVersions = (a: string | null | undefined, b: string | null | undefined): number => {
  const parse = (value: string | null | undefined) => String(value || '').trim().replace(/^v/i, '').split(/[.\-+]/).map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export const normalizeVersion = (tag: string | null | undefined): string => String(tag || '').trim().replace(/^v/i, '')

// Finds the hash for one file in a "<hash>  <name>" or "<hash> *<name>" list.
export const findChecksum = (sumsText: string, assetName: string): string | undefined => {
  for (const line of sumsText.split(/\r?\n/)) {
    const [hash, name] = line.trim().split(/\s+/)
    if (name?.replace(/^\*/, '') === assetName && /^[a-f0-9]{64}$/i.test(hash)) return hash.toLowerCase()
  }
  return undefined
}

// Updated engines are saved as "<engine>-<version>[.exe]" so a running copy is
// never overwritten; this reads the version back from such a name.
export const versionFromEngineFile = (engine: EngineId, fileName: string): string | null => {
  const match = fileName.match(new RegExp(`^${engine.replace('-', '\\-')}-(\\d[\\d.]*\\d)(?:\\.exe)?$`))
  return match ? match[1] : null
}

export const engineFileName = (engine: EngineId, version: string, platform: string): string =>
  `${engine}-${version}${platform === 'win32' ? '.exe' : ''}`

// At most one automatic check a day.
export const ENGINE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
export const isEngineCheckDue = (lastCheckedAt: number | undefined, now = Date.now()): boolean =>
  !lastCheckedAt || now - lastCheckedAt >= ENGINE_CHECK_INTERVAL_MS
